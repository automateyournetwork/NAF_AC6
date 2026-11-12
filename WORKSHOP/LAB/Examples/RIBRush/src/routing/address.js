function invalidAddress(value) {
  throw new TypeError(`Invalid IP address: ${value}`);
}

function parseIPv4(value) {
  const parts = value.split(".");
  if (parts.length !== 4) {
    invalidAddress(value);
  }

  const bytes = parts.map((part) => {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) {
      invalidAddress(value);
    }
    const octet = Number(part);
    if (octet > 255) {
      invalidAddress(value);
    }
    return octet;
  });

  return new Uint8Array(bytes);
}

function parseIPv6(value) {
  if (value.includes("%")) {
    invalidAddress(value);
  }

  let expandedInput = value;
  if (expandedInput.includes(".")) {
    const lastColon = expandedInput.lastIndexOf(":");
    if (lastColon < 0 || lastColon === expandedInput.length - 1) {
      invalidAddress(value);
    }
    const ipv4Bytes = parseIPv4(expandedInput.slice(lastColon + 1));
    const high = ((ipv4Bytes[0] << 8) | ipv4Bytes[1]).toString(16);
    const low = ((ipv4Bytes[2] << 8) | ipv4Bytes[3]).toString(16);
    expandedInput = `${expandedInput.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const compressionIndex = expandedInput.indexOf("::");
  if (
    compressionIndex !== -1 &&
    expandedInput.indexOf("::", compressionIndex + 2) !== -1
  ) {
    invalidAddress(value);
  }

  const parseGroups = (part) => {
    if (part === "") {
      return [];
    }
    const groups = part.split(":");
    if (groups.some((group) => !/^[\da-fA-F]{1,4}$/.test(group))) {
      invalidAddress(value);
    }
    return groups.map((group) => Number.parseInt(group, 16));
  };

  let groups;
  if (compressionIndex === -1) {
    groups = parseGroups(expandedInput);
    if (groups.length !== 8) {
      invalidAddress(value);
    }
  } else {
    const left = parseGroups(expandedInput.slice(0, compressionIndex));
    const right = parseGroups(expandedInput.slice(compressionIndex + 2));
    const zeroCount = 8 - left.length - right.length;
    if (zeroCount < 1) {
      invalidAddress(value);
    }
    groups = [...left, ...Array(zeroCount).fill(0), ...right];
  }

  const bytes = new Uint8Array(16);
  groups.forEach((group, index) => {
    bytes[index * 2] = group >> 8;
    bytes[index * 2 + 1] = group & 0xff;
  });
  return bytes;
}

function formatIPv4(bytes) {
  return [...bytes].join(".");
}

function formatIPv6(bytes) {
  const groups = [];
  for (let index = 0; index < bytes.length; index += 2) {
    groups.push((bytes[index] << 8) | bytes[index + 1]);
  }

  let bestStart = -1;
  let bestLength = 1;
  for (let index = 0; index < groups.length;) {
    if (groups[index] !== 0) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < groups.length && groups[end] === 0) {
      end += 1;
    }
    if (end - index > bestLength) {
      bestStart = index;
      bestLength = end - index;
    }
    index = end;
  }

  if (bestStart === -1) {
    return groups.map((group) => group.toString(16)).join(":");
  }

  const left = groups.slice(0, bestStart).map((group) => group.toString(16)).join(":");
  const right = groups
    .slice(bestStart + bestLength)
    .map((group) => group.toString(16))
    .join(":");
  return `${left}::${right}`;
}

export function parseAddress(value) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    invalidAddress(value);
  }

  if (!value.includes(":")) {
    const bytes = parseIPv4(value);
    return { family: "ipv4", bytes, formatted: formatIPv4(bytes) };
  }

  const bytes = parseIPv6(value);
  return { family: "ipv6", bytes, formatted: formatIPv6(bytes) };
}

export function parsePrefix(networkAddress, prefixLength) {
  const address = parseAddress(networkAddress);
  const bitLength = address.family === "ipv4" ? 32 : 128;
  if (
    !Number.isInteger(prefixLength) ||
    prefixLength < 0 ||
    prefixLength > bitLength
  ) {
    throw new RangeError(`Invalid ${address.family} prefix length: ${prefixLength}`);
  }

  const fullBytes = Math.floor(prefixLength / 8);
  const remainingBits = prefixLength % 8;
  for (let index = 0; index < address.bytes.length; index += 1) {
    const mask =
      index < fullBytes
        ? 0xff
        : index === fullBytes && remainingBits > 0
          ? (0xff << (8 - remainingBits)) & 0xff
          : 0;
    if ((address.bytes[index] & mask) !== address.bytes[index]) {
      throw new TypeError(
        `Route network has host bits set: ${networkAddress}/${prefixLength}`,
      );
    }
  }

  return {
    family: address.family,
    networkAddress: address.formatted,
    prefixLength,
    bytes: address.bytes,
    key: `${address.family}:${address.formatted}/${prefixLength}`,
  };
}

export function prefixContains(prefix, destination) {
  if (
    !prefix ||
    !ArrayBuffer.isView(prefix.bytes) ||
    !Number.isInteger(prefix.prefixLength)
  ) {
    throw new TypeError("Expected a parsed prefix");
  }

  const address = parseAddress(destination);
  if (address.family !== prefix.family) {
    return false;
  }

  const fullBytes = Math.floor(prefix.prefixLength / 8);
  for (let index = 0; index < fullBytes; index += 1) {
    if (prefix.bytes[index] !== address.bytes[index]) {
      return false;
    }
  }

  const remainingBits = prefix.prefixLength % 8;
  if (remainingBits > 0) {
    const mask = (0xff << (8 - remainingBits)) & 0xff;
    if ((prefix.bytes[fullBytes] & mask) !== (address.bytes[fullBytes] & mask)) {
      return false;
    }
  }
  return true;
}
