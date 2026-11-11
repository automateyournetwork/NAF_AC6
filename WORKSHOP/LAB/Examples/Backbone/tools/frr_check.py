"""Compare the spec's hand-worked routing cases with a real OSPF implementation (FRR).

Usage: python3 tools/frr_check.py [--keep] [--image IMAGE]

Builds topologies T1 and T2 of tests/fixtures/ospf-cases.json as FRR routers in Docker, one
Docker network per link, and compares each case's cost and next hops with what FRR installs.
This is a control-plane check: it reads FRR's routing table, it does not send traffic.

A comparison is only made when the lab is healthy: every expected adjacency is Full and every
router ID is the one configured. Otherwise the result is "no valid verdict", never a pass.

Exit status: 0 all cases match, 1 a case differs, 2 no valid verdict (lab not healthy or
Docker unavailable). The containers run privileged on this machine only and are removed at
the end unless --keep is given.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import subprocess
import sys
import tempfile
import time
import traceback
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tests" / "fixtures" / "ospf-cases.json"
DEFAULT_IMAGE = "quay.io/frrouting/frr:10.7.1"
HELLO_SECONDS = 1
DEAD_SECONDS = 4
CONVERGE_SECONDS = 90

DAEMONS = """zebra=yes
ospfd=yes
bgpd=no
ospf6d=no
ripd=no
ripngd=no
isisd=no
pimd=no
ldpd=no
nhrpd=no
eigrpd=no
babeld=no
sharpd=no
pbrd=no
bfdd=no
fabricd=no
vrrpd=no
pathd=no
vtysh_enable=yes
zebra_options="  -A 127.0.0.1 -s 90000000"
ospfd_options="  -A 127.0.0.1"
"""


class LabError(RuntimeError):
    """The lab could not be built or did not become healthy: no valid verdict."""


def run(args: list[str], check: bool = True) -> str:
    """Runs a command without a shell and returns its standard output."""
    try:
        done = subprocess.run(args, capture_output=True, text=True, check=False)
    except OSError as error:
        # Docker is not installed, or not on PATH.
        raise LabError(f"{args[0]} could not be run: {error}") from error
    if check and done.returncode != 0:
        raise LabError(
            f"{' '.join(args[:4])} … failed: {done.stderr.strip() or done.stdout.strip()}"
        )
    return done.stdout


@dataclass
class Link:
    a: str
    b: str
    cost: int
    network: str = ""
    subnet: ipaddress.IPv4Network | None = None
    up: bool = True


@dataclass
class Lab:
    """One topology built from FRR containers."""

    name: str
    routers: dict[str, int]
    links: list[Link]
    image: str
    prefix: str
    containers: dict[str, str] = field(default_factory=dict)
    # interface[(router, peer)] is the name of router's interface on its link to peer.
    interface: dict[tuple[str, str], str] = field(default_factory=dict)
    # owner[address] is the router that holds that link address.
    owner: dict[str, str] = field(default_factory=dict)

    def loopback(self, router: str) -> str:
        return f"10.255.{self.index}.{self.routers[router]}"

    @property
    def index(self) -> int:
        return 1 if self.name == "T1" else 2

    def vtysh(self, router: str, *commands: str) -> str:
        args = ["docker", "exec", self.containers[router], "vtysh"]
        for command in commands:
            args += ["-c", command]
        return run(args)

    def show(self, router: str, command: str) -> Any:
        output = self.vtysh(router, command)
        try:
            return json.loads(output or "{}")
        except json.JSONDecodeError as error:
            raise LabError(
                f"{router}: '{command}' did not print JSON: {output.strip()[:120]}"
            ) from error

    def build(self, base: int) -> None:
        with tempfile.TemporaryDirectory() as work:
            for n, link in enumerate(self.links):
                link.subnet = ipaddress.ip_network(f"10.{base}.{n}.0/29")
                link.network = f"{self.prefix}-{self.name.lower()}-{link.a.lower()}{link.b.lower()}"
                run(
                    [
                        "docker",
                        "network",
                        "create",
                        "--subnet",
                        str(link.subnet),
                        link.network,
                    ]
                )
            for router, router_id in self.routers.items():
                container = f"{self.prefix}-{self.name.lower()}-{router.lower()}"
                own = [link for link in self.links if router in (link.a, link.b)]
                run(
                    [
                        "docker",
                        "create",
                        "--name",
                        container,
                        "--hostname",
                        f"r{router.lower()}",
                        "--privileged",
                        "--sysctl",
                        "net.ipv4.ip_forward=1",
                        "--network",
                        own[0].network,
                        self.image,
                    ]
                )
                self.containers[router] = container
                for link in own[1:]:
                    run(["docker", "network", "connect", link.network, container])
                conf = Path(work) / f"{container}.conf"
                conf.write_text(
                    "frr defaults traditional\n"
                    f"hostname r{router.lower()}\n"
                    "!\n"
                    "interface lo\n"
                    f" ip address {self.loopback(router)}/32\n"
                    " ip ospf area 0\n"
                    "!\n"
                    "router ospf\n"
                    f" ospf router-id 0.0.0.{router_id}\n"
                    " timers throttle spf 50 100 500\n"
                    "!\n"
                )
                daemons = Path(work) / f"{container}.daemons"
                daemons.write_text(DAEMONS)
                run(["docker", "cp", str(conf), f"{container}:/etc/frr/frr.conf"])
                run(["docker", "cp", str(daemons), f"{container}:/etc/frr/daemons"])
                run(["docker", "start", container])
        self.wait_for_daemons()
        self.configure_interfaces()

    def wait_for_daemons(self) -> None:
        deadline = time.monotonic() + 60
        for router in self.routers:
            while True:
                done = subprocess.run(
                    [
                        "docker",
                        "exec",
                        self.containers[router],
                        "vtysh",
                        "-c",
                        "show ip ospf json",
                    ],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if done.returncode == 0 and done.stdout.strip().startswith("{"):
                    break
                if time.monotonic() > deadline:
                    raise LabError(f"{self.name}: FRR did not start on router {router}")
                time.sleep(1)

    def configure_interfaces(self) -> None:
        """Finds each router's interface on each link by its address, then sets cost and timers."""
        for router in self.routers:
            addresses = json.loads(
                run(["docker", "exec", self.containers[router], "ip", "-j", "addr"])
            )
            for link in self.links:
                if router not in (link.a, link.b):
                    continue
                peer = link.b if router == link.a else link.a
                for entry in addresses:
                    for info in entry.get("addr_info", []):
                        if (
                            info.get("family") == "inet"
                            and ipaddress.ip_address(info["local"]) in link.subnet
                        ):  # type: ignore[operator]
                            self.interface[(router, peer)] = entry["ifname"]
                            self.owner[info["local"]] = router
                if (router, peer) not in self.interface:
                    raise LabError(
                        f"{self.name}: router {router} has no interface on link {link.a}–{link.b}"
                    )
                self.vtysh(
                    router,
                    "configure terminal",
                    f"interface {self.interface[(router, peer)]}",
                    "ip ospf area 0",
                    "ip ospf network point-to-point",
                    f"ip ospf cost {link.cost}",
                    f"ip ospf hello-interval {HELLO_SECONDS}",
                    f"ip ospf dead-interval {DEAD_SECONDS}",
                )

    def set_cost(self, a: str, b: str, cost: int) -> None:
        """One cost per link, used in both directions (S2): set it on both ends."""
        for router, peer in ((a, b), (b, a)):
            self.vtysh(
                router,
                "configure terminal",
                f"interface {self.interface[(router, peer)]}",
                f"ip ospf cost {cost}",
            )
        self.link(a, b).cost = cost

    def set_up(self, a: str, b: str, up: bool) -> None:
        for router, peer in ((a, b), (b, a)):
            self.vtysh(
                router,
                "configure terminal",
                f"interface {self.interface[(router, peer)]}",
                "no shutdown" if up else "shutdown",
            )
        self.link(a, b).up = up

    def link(self, a: str, b: str) -> Link:
        return next(link for link in self.links if {link.a, link.b} == {a, b})

    def health(self) -> list[str]:
        """Problems that make a comparison meaningless. Empty when the lab is healthy."""
        problems: list[str] = []
        names = {
            f"0.0.0.{router_id}": router for router, router_id in self.routers.items()
        }
        for router, router_id in self.routers.items():
            ospf = self.show(router, "show ip ospf json")
            if ospf.get("routerId") != f"0.0.0.{router_id}":
                problems.append(
                    f"{router}: router ID is {ospf.get('routerId')}, configured 0.0.0.{router_id}"
                )
            expected = {
                link.b if link.a == router else link.a
                for link in self.links
                if link.up and router in (link.a, link.b)
            }
            neighbours = self.show(router, "show ip ospf neighbor json").get(
                "neighbors", {}
            )
            full = set()
            for neighbour_id, entries in neighbours.items():
                for entry in entries:
                    state = str(
                        entry.get("nbrState")
                        or entry.get("converged")
                        or entry.get("state")
                        or ""
                    )
                    if state.startswith("Full") and neighbour_id in names:
                        full.add(names[neighbour_id])
            if full != expected:
                problems.append(
                    f"{router}: Full with {sorted(full)}, expected {sorted(expected)}"
                )
        return problems

    def wait_healthy(self) -> int:
        deadline = time.monotonic() + CONVERGE_SECONDS
        problems = self.health()
        while problems and time.monotonic() < deadline:
            time.sleep(1)
            problems = self.health()
        if problems:
            raise LabError(f"{self.name} is not healthy: " + "; ".join(problems))
        return sum(1 for link in self.links if link.up) * 2

    def route(self, source: str, destination: str) -> tuple[int, list[str]] | None:
        """FRR's OSPF route from one router to another's loopback: (cost, next-hop routers)."""
        table = self.show(source, "show ip route ospf json")
        entries = table.get(f"{self.loopback(destination)}/32")
        if not entries:
            return None
        # Only a route FRR has selected and installed is its answer, and only the next hops it
        # is forwarding through. Anything else counts as no route, never as a match.
        entry = next(
            (e for e in entries if e.get("selected") and e.get("installed")), None
        )
        if entry is None:
            return None
        hops = sorted(
            {
                self.owner[hop["ip"]]
                for hop in entry.get("nexthops", [])
                if hop.get("active") and hop.get("fib") and hop.get("ip") in self.owner
            }
        )
        if "metric" not in entry:
            raise LabError(f"{source}: FRR's route to {destination} has no metric")
        return int(entry["metric"]), hops

    def destroy(self) -> None:
        for container in self.containers.values():
            run(["docker", "rm", "-f", container], check=False)
        for link in self.links:
            if link.network:
                run(["docker", "network", "rm", link.network], check=False)


def matches(item: dict[str, Any], got: tuple[int, list[str]] | None) -> bool:
    """Whether FRR's route agrees with what a case states: a cost, next hops, or both."""
    return (
        got is not None
        and ("cost" not in item or got[0] == item["cost"])
        and ("nextHops" not in item or got[1] == sorted(item["nextHops"]))
    )


def settle(
    lab: Lab, expected: list[dict[str, Any]], unreachable: list[list[str]]
) -> None:
    """Waits until FRR's table shows the expectation, or the time runs out.

    It waits for everything compare() reads, next hops as well as costs. A change can leave a
    cost as it was and move only the next hops; waiting for the cost alone would then return
    before FRR had run its route calculation again, and a correct model would be failed.
    """
    deadline = time.monotonic() + CONVERGE_SECONDS
    while time.monotonic() < deadline:
        stated_ok = all(matches(e, lab.route(e["from"], e["to"])) for e in expected)
        gone_ok = all(lab.route(a, b) is None for a, b in unreachable)
        if stated_ok and gone_ok:
            return
        time.sleep(1)


def compare(
    lab: Lab,
    label: str,
    expected: list[dict[str, Any]],
    unreachable: list[list[str]],
    rows: list[dict[str, Any]],
) -> None:
    for item in expected:
        got = lab.route(item["from"], item["to"])
        want_hops = sorted(item["nextHops"]) if "nextHops" in item else None
        # A case states a cost, next hops, or both. Only what the spec states is compared.
        ok = matches(item, got)
        rows.append(
            {
                "case": label,
                "route": f"{item['from']}→{item['to']}",
                "expected": {"cost": item.get("cost"), "nextHops": want_hops},
                "frr": None if got is None else {"cost": got[0], "nextHops": got[1]},
                "match": ok,
            }
        )
    for a, b in unreachable:
        got = lab.route(a, b)
        rows.append(
            {
                "case": label,
                "route": f"{a}→{b}",
                "expected": "no route",
                "frr": None if got is None else {"cost": got[0], "nextHops": got[1]},
                "match": got is None,
            }
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", maxsplit=1)[0])
    parser.add_argument(
        "--keep", action="store_true", help="leave the containers and networks in place"
    )
    parser.add_argument("--image", default=DEFAULT_IMAGE)
    parser.add_argument(
        "--base",
        type=int,
        default=87,
        help="second octet of the lab's link subnets (10.BASE.n.0/29)",
    )
    args = parser.parse_args()

    prefix = f"bbfrr{os.getpid()}"
    labs: list[Lab] = []
    rows: list[dict[str, Any]] = []
    adjacencies: dict[str, int] = {}
    try:
        fixtures = json.loads(FIXTURES.read_text())
        run(["docker", "version", "--format", "{{.Server.Version}}"])
        for n, (name, topology) in enumerate(fixtures["topologies"].items()):
            lab = Lab(
                name,
                topology["routers"],
                [Link(a, b, cost) for a, b, cost in topology["links"]],
                args.image,
                prefix,
            )
            labs.append(lab)
            lab.build(args.base + n)
            adjacencies[name] = lab.wait_healthy()

        by_name = {lab.name: lab for lab in labs}
        for case in fixtures["routing"]:
            if not case["sharing"]:
                # Case 6 keeps one route and breaks the tie by lowest router ID. That tie-break is
                # the game's simplification S7; RFC 2328 does not define it, so FRR is not its judge.
                rows.append(
                    {
                        "case": f"case {case['case']}",
                        "route": "tie-break",
                        "expected": "the game's rule (S7)",
                        "frr": "not compared",
                        "match": None,
                    }
                )
                continue
            # Each case runs on the topology it names, not on T1 by assumption.
            net = by_name.get(case["topology"])
            if net is None:
                raise LabError(
                    f"case {case['case']}: no lab was built for topology {case['topology']}"
                )
            changed_costs = [
                (a, b, net.link(a, b).cost) for a, b, _ in case.get("setCost", [])
            ]
            for a, b, cost in case.get("setCost", []):
                net.set_cost(a, b, cost)
            for a, b in case.get("cut", []):
                net.set_up(a, b, False)
            net.wait_healthy()
            settle(net, case["expect"], case.get("unreachable", []))
            compare(
                net,
                f"case {case['case']}",
                case["expect"],
                case.get("unreachable", []),
                rows,
            )
            for a, b, cost in changed_costs:
                net.set_cost(a, b, cost)
            for a, b in case.get("cut", []):
                net.set_up(a, b, True)
            net.wait_healthy()

        # Case 7: the split is per hop. FRR's part is the control plane: which next hops each
        # router on the way holds. The shares follow from equal sharing at each hop.
        t2 = next(lab for lab in labs if lab.name == "T2")
        split = next(s for s in fixtures["split"] if s["case"] == 7)
        per_hop: dict[str, list[str]] = {}
        for key in split["shares"]:
            near, far = key.split("-")
            per_hop.setdefault(near, []).append(far)
        # The spec gives the cost from the source only. For the routers on the way it gives the
        # shares, and so their next hops; their costs are not stated and are not compared.
        expected: list[dict[str, Any]] = [
            {"from": near, "to": split["to"], "nextHops": hops}
            for near, hops in per_hop.items()
        ]
        if expected[0]["from"] != split["from"]:
            raise LabError("case 7: the fixture's first share is not from the source")
        expected[0]["cost"] = split["cost"]
        settle(t2, expected, [])
        compare(t2, "case 7", expected, [], rows)
    except Exception as error:  # noqa: BLE001
        # LabError is the expected way to have no verdict. Anything else that goes wrong while
        # building or reading the lab is no verdict either: status 1 means a case differs, and
        # must never be the result of a comparison that was not made.
        if isinstance(error, LabError):
            reason = str(error)
        else:
            # A fault in this tool or in the fixture, not in the lab: say where, on stderr,
            # so that it is not read as "Docker unavailable".
            reason = f"unexpected {type(error).__name__}: {error}"
            traceback.print_exc(file=sys.stderr)
        print(
            json.dumps(
                {"verdict": "no valid verdict", "reason": reason, "rows": rows},
                indent=2,
                ensure_ascii=False,
            )
        )
        return 2
    finally:
        if not args.keep:
            for lab in labs:
                lab.destroy()

    compared = [row for row in rows if row["match"] is not None]
    failed = [row for row in compared if not row["match"]]
    print(
        json.dumps(
            {
                "verdict": "pass" if not failed else "fail",
                "image": args.image,
                "timers": {"hello": HELLO_SECONDS, "dead": DEAD_SECONDS},
                "adjacenciesFull": adjacencies,
                "compared": len(compared),
                "matched": len(compared) - len(failed),
                "rows": rows,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
