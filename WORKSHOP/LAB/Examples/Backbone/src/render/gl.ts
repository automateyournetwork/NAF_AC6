// The WebGL2 renderer. It draws the same shared scene as the fallback renderer, the same
// way round (links, pulses, sites, effects, each painted over the last), and then adds a
// soft bloom. Colors come from the palette; the still part of the map is drawn by the
// fallback renderer's own routine into a texture, so the two cannot drift apart.

import type { Palette } from "../content/load";
import { drawBackdrop, linkColor, type Renderer } from "./canvas2d";
import { rgb01, type Rgb } from "./color";
import type { DrawReport, Scene } from "./viewmodel";

const SEG_FLOATS = 15;
const DISC_FLOATS = 10;

const SEG_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec2 aP0;
layout(location=2) in vec2 aP1;
layout(location=3) in float aHalf;
layout(location=4) in vec4 aColor;
layout(location=5) in vec2 aDash;
layout(location=6) in vec2 aFade;
layout(location=7) in float aGlow;
layout(location=8) in float aBloom;
uniform vec2 uSize;
out float vAlong;
out float vAcross;
out float vLength;
flat out float vHalf;
flat out vec4 vColor;
flat out vec2 vDash;
flat out vec2 vFade;
flat out float vGlow;
flat out float vBloom;
void main() {
  vec2 d = aP1 - aP0;
  float len = max(length(d), 0.0001);
  vec2 u = d / len;
  vec2 n = vec2(-u.y, u.x);
  float reach = aHalf * (aGlow > 0.0 ? 3.6 : 1.0) + 1.5;
  float along = aCorner.x * len + (aCorner.x * 2.0 - 1.0) * 1.5;
  vec2 pos = aP0 + u * along + n * aCorner.y * reach;
  vAlong = along;
  vAcross = aCorner.y * reach;
  vLength = len;
  vHalf = aHalf;
  vColor = aColor;
  vDash = aDash;
  vFade = aFade;
  vGlow = aGlow;
  vBloom = aBloom;
  gl_Position = vec4(pos.x / uSize.x * 2.0 - 1.0, 1.0 - pos.y / uSize.y * 2.0, 0.0, 1.0);
}`;

// uPass 0 draws the scene. uPass 1 draws the light that the bloom is blurred from; that
// light is pulled most of the way toward white, so that when it falls on a line of another
// color it lightens the line without shifting its hue.
const SEG_FS = `#version 300 es
precision highp float;
in float vAlong;
in float vAcross;
in float vLength;
flat in float vHalf;
flat in vec4 vColor;
flat in vec2 vDash;
flat in vec2 vFade;
flat in float vGlow;
flat in float vBloom;
uniform float uPass;
out vec4 outColor;
void main() {
  float across = abs(vAcross);
  float t = clamp(vAlong / vLength, 0.0, 1.0);
  float ends = smoothstep(-1.0, 0.5, vAlong) * (1.0 - smoothstep(vLength - 0.5, vLength + 1.0, vAlong));
  float dash = vDash.x > 0.0 ? step(mod(vAlong, vDash.x + vDash.y), vDash.x) : 1.0;
  float core = (1.0 - smoothstep(vHalf - 0.6, vHalf + 0.6, across)) * vColor.a;
  float halo = vGlow * 0.16 * (1.0 - smoothstep(vHalf * 3.6 - 1.0, vHalf * 3.6 + 1.0, across));
  float shape = mix(vFade.x, vFade.y, t) * dash * ends;
  if (uPass > 0.5) {
    float a = core * shape * vBloom;
    float grey = dot(vColor.rgb, vec3(0.299, 0.587, 0.114));
    outColor = vec4(mix(vColor.rgb, vec3(grey), 0.65) * a, a);
  } else {
    float a = (core + halo * (1.0 - core)) * shape;
    outColor = vec4(vColor.rgb * a, a);
  }
}`;

const DISC_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec2 aCenter;
layout(location=2) in float aRadius;
layout(location=3) in float aInner;
layout(location=4) in vec4 aColor;
layout(location=5) in float aDashes;
layout(location=6) in float aBloom;
uniform vec2 uSize;
out vec2 vLocal;
flat out float vRadius;
flat out float vInner;
flat out vec4 vColor;
flat out float vDashes;
flat out float vBloom;
void main() {
  vLocal = aCorner * (aRadius + 1.5);
  vec2 pos = aCenter + vLocal;
  vRadius = aRadius;
  vInner = aInner;
  vColor = aColor;
  vDashes = aDashes;
  vBloom = aBloom;
  gl_Position = vec4(pos.x / uSize.x * 2.0 - 1.0, 1.0 - pos.y / uSize.y * 2.0, 0.0, 1.0);
}`;

const DISC_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
flat in float vRadius;
flat in float vInner;
flat in vec4 vColor;
flat in float vDashes;
flat in float vBloom;
uniform float uPass;
out vec4 outColor;
void main() {
  float d = length(vLocal);
  float a = (1.0 - smoothstep(vRadius - 0.6, vRadius + 0.6, d)) * vColor.a;
  if (vInner > 0.0) a *= smoothstep(vInner - 0.6, vInner + 0.6, d);
  if (vDashes > 0.0) a *= step(fract(atan(vLocal.y, vLocal.x) / 6.2831853 * vDashes), 0.55);
  if (uPass > 0.5) {
    a *= vBloom;
    float grey = dot(vColor.rgb, vec3(0.299, 0.587, 0.114));
    outColor = vec4(mix(vColor.rgb, vec3(grey), 0.65) * a, a);
  } else {
    outColor = vec4(vColor.rgb * a, a);
  }
}`;

const FULL_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uStep;
out vec4 outColor;
void main() {
  vec4 sum = texture(uTex, vUv) * 0.227027;
  sum += (texture(uTex, vUv + uStep * 1.0) + texture(uTex, vUv - uStep * 1.0)) * 0.1945946;
  sum += (texture(uTex, vUv + uStep * 2.0) + texture(uTex, vUv - uStep * 2.0)) * 0.1216216;
  sum += (texture(uTex, vUv + uStep * 3.0) + texture(uTex, vUv - uStep * 3.0)) * 0.054054;
  sum += (texture(uTex, vUv + uStep * 4.0) + texture(uTex, vUv - uStep * 4.0)) * 0.016216;
  outColor = sum;
}`;

// The final pass: backdrop, the scanning sweep, the scene over them, then the bloom. A
// color that comes out too bright is scaled down as a whole, which keeps its hue; clipping
// each channel by itself would turn amber into yellow.
const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uBackdrop;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec3 uSweepColor;
uniform float uSweepX;
uniform float uSweepWidth;
uniform float uBloomStrength;
out vec4 outColor;
void main() {
  vec3 base = texture(uBackdrop, vUv).rgb;
  float dist = uSweepX - vUv.x;
  if (uSweepX > -0.5 && dist > 0.0 && dist < uSweepWidth) base = mix(base, uSweepColor, (1.0 - dist / uSweepWidth) * 0.09);
  vec4 scene = texture(uScene, vUv);
  vec3 color = base * (1.0 - scene.a) + scene.rgb;
  color += texture(uBloom, vUv).rgb * uBloomStrength * (1.0 - 0.5 * scene.a);
  float peak = max(color.r, max(color.g, color.b));
  if (peak > 1.0) color /= peak;
  outColor = vec4(color, 1.0);
}`;

interface Target {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

/** A growing list of instance data. */
class Instances {
  data: Float32Array;
  count = 0;
  constructor(private readonly floats: number) {
    this.data = new Float32Array(floats * 256);
  }
  reset(): void {
    this.count = 0;
  }
  push(values: number[]): void {
    if ((this.count + 1) * this.floats > this.data.length) {
      const bigger = new Float32Array(this.data.length * 2);
      bigger.set(this.data);
      this.data = bigger;
    }
    this.data.set(values, this.count * this.floats);
    this.count++;
  }
}

export class GlRenderer implements Renderer {
  readonly name = "gl" as const;
  /** Set when the context is lost. The caller then switches to the fallback renderer. */
  failed = false;

  private readonly segProgram: WebGLProgram;
  private readonly discProgram: WebGLProgram;
  private readonly blurProgram: WebGLProgram;
  private readonly compositeProgram: WebGLProgram;
  private readonly segVao: WebGLVertexArrayObject;
  private readonly discVao: WebGLVertexArrayObject;
  private readonly fullVao: WebGLVertexArrayObject;
  private readonly segBuffer: WebGLBuffer;
  private readonly discBuffer: WebGLBuffer;
  private readonly backdropTexture: WebGLTexture;
  private readonly backdropCanvas: HTMLCanvasElement;
  private readonly backdropContext: CanvasRenderingContext2D;
  private readonly segs = new Instances(SEG_FLOATS);
  private readonly discs = new Instances(DISC_FLOATS);
  private sceneTarget: Target | null = null;
  private glowA: Target | null = null;
  private glowB: Target | null = null;
  private backdropKey = "";
  private width = 1;
  private height = 1;
  private dpr = 1;

  /** Returns null when this browser has no WebGL2, so the caller can fall back. */
  static create(canvas: HTMLCanvasElement, palette: Palette): GlRenderer | null {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, premultipliedAlpha: true });
    if (!gl) return null;
    try {
      return new GlRenderer(canvas, gl, palette);
    } catch {
      return null;
    }
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
    private readonly palette: Palette,
  ) {
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.failed = true;
    });
    this.segProgram = this.program(SEG_VS, SEG_FS);
    this.discProgram = this.program(DISC_VS, DISC_FS);
    this.blurProgram = this.program(FULL_VS, BLUR_FS);
    this.compositeProgram = this.program(FULL_VS, COMPOSITE_FS);

    const strip = (corners: number[]): WebGLBuffer => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(corners), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      return buffer;
    };
    const instanced = (sizes: number[], floats: number): WebGLBuffer => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      let offset = 0;
      sizes.forEach((size, i) => {
        gl.enableVertexAttribArray(i + 1);
        gl.vertexAttribPointer(i + 1, size, gl.FLOAT, false, floats * 4, offset * 4);
        gl.vertexAttribDivisor(i + 1, 1);
        offset += size;
      });
      return buffer;
    };

    this.segVao = gl.createVertexArray();
    gl.bindVertexArray(this.segVao);
    strip([0, -1, 1, -1, 0, 1, 1, 1]);
    this.segBuffer = instanced([2, 2, 1, 4, 2, 2, 1, 1], SEG_FLOATS);

    this.discVao = gl.createVertexArray();
    gl.bindVertexArray(this.discVao);
    strip([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.discBuffer = instanced([2, 1, 1, 4, 1, 1], DISC_FLOATS);

    this.fullVao = gl.createVertexArray();
    gl.bindVertexArray(this.fullVao);
    strip([-1, -1, 1, -1, -1, 1, 1, 1]);
    gl.bindVertexArray(null);

    this.backdropCanvas = document.createElement("canvas");
    const context = this.backdropCanvas.getContext("2d");
    if (!context) throw new Error("no 2D context for the backdrop");
    this.backdropContext = context;
    this.backdropTexture = this.texture();
  }

  private program(vertex: string, fragment: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader failed");
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "program failed");
    return program;
  }

  private texture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  private target(width: number, height: number): Target {
    const gl = this.gl;
    const texture = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { framebuffer, texture, width, height };
  }

  private release(target: Target | null): void {
    if (!target) return;
    this.gl.deleteFramebuffer(target.framebuffer);
    this.gl.deleteTexture(target.texture);
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    this.canvas.width = w;
    this.canvas.height = h;
    this.backdropCanvas.width = w;
    this.backdropCanvas.height = h;
    this.backdropKey = "";
    for (const old of [this.sceneTarget, this.glowA, this.glowB]) this.release(old);
    this.sceneTarget = this.target(w, h);
    this.glowA = this.target(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.glowB = this.target(Math.max(1, w >> 1), Math.max(1, h >> 1));
  }

  /** The still part of the map changes only when the camera moves, so it is redrawn only then. */
  private backdrop(scene: Scene): void {
    const first = scene.land[0] ?? [];
    const last = scene.grid.at(-1) ?? [];
    const key = [scene.width, scene.height, first[0], first[1], first.at(-1), last[0], last[3], scene.grid.length, scene.land.length].join(",");
    if (key === this.backdropKey) return;
    this.backdropKey = key;
    const gl = this.gl;
    this.backdropContext.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawBackdrop(this.backdropContext, scene, this.palette);
    gl.bindTexture(gl.TEXTURE_2D, this.backdropTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.backdropCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  draw(scene: Scene): Pick<DrawReport, "links" | "pulses" | "sites" | "effects"> {
    const gl = this.gl;
    const p = this.palette;
    const report = { links: 0, pulses: 0, sites: 0, effects: 0 };
    if (this.failed || !this.sceneTarget || !this.glowA || !this.glowB) return report;
    this.backdrop(scene);

    const segs = this.segs;
    const discs = this.discs;
    segs.reset();
    discs.reset();
    const seg = (ax: number, ay: number, bx: number, by: number, half: number, c: Rgb, alpha: number, dash: number, gap: number, fade0: number, fade1: number, glow: number, bloom: number): void =>
      segs.push([ax, ay, bx, by, half, c[0], c[1], c[2], alpha, dash, gap, fade0, fade1, glow, bloom]);
    const disc = (x: number, y: number, radius: number, inner: number, c: Rgb, alpha: number, dashes: number, bloom: number): void =>
      discs.push([x, y, radius, inner, c[0], c[1], c[2], alpha, dashes, bloom]);

    const pulse = rgb01(p.pulse!);
    const failure = rgb01(p.failure!);
    const background = rgb01(p.background!);
    const linkBlue = rgb01(p.link!);
    const siteRing = rgb01(p.site!);

    // Links. A cut link is a broken, dashed line with no halo and no part in the bloom.
    for (const link of scene.links) {
      const color = rgb01(linkColor(link, p));
      const faded = link.pending === "remove" ? 0.3 : 1;
      const alpha = (0.55 + 0.45 * link.glow) * faded;
      const half = link.width / 2;
      if (link.look === "cut") {
        const at = (t: number): [number, number] => [link.ax + (link.bx - link.ax) * t, link.ay + (link.by - link.ay) * t];
        const [m1x, m1y] = at(0.43);
        const [m2x, m2y] = at(0.57);
        seg(link.ax, link.ay, m1x, m1y, half, color, alpha, 9 * link.s, 7 * link.s, 1, 1, 0, 0);
        seg(m2x, m2y, link.bx, link.by, half, color, alpha, 9 * link.s, 7 * link.s, 1, 1, 0, 0);
      } else {
        const dashed = link.pending === "new";
        seg(link.ax, link.ay, link.bx, link.by, half, color, alpha, dashed ? 7 * link.s : 0, dashed ? 6 * link.s : 0, 1, 1, link.glow * faded, faded);
      }
      report.links++;
    }
    const linkSegs = segs.count;

    // Pulses: a trail unless motion is reduced, then the head.
    for (const item of scene.pulses) {
      if (item.tx !== item.x || item.ty !== item.y) seg(item.tx, item.ty, item.x, item.y, 0.9 * item.s, pulse, 1, 0, 0, 0, 0.55, 0, 1);
      report.pulses++;
    }
    const trailSegs = segs.count;
    for (const item of scene.pulses) {
      disc(item.x, item.y, 5 * item.s, 0, pulse, 0.22, 0, 1);
      disc(item.x, item.y, 2.3 * item.s, 0, pulse, 1, 0, 1);
    }
    const pulseDiscs = discs.count;

    // Sites: a soft blue glow, a disc of background that hides the link ends, the ring, the core.
    for (const site of scene.sites) {
      const r = 9 * site.s;
      const ring = site.state === "dark" ? failure : siteRing;
      if (site.state !== "dark") disc(site.x, site.y, r * 2.1, 0, linkBlue, 0.2, 0, 0);
      disc(site.x, site.y, r, 0, background, 1, 0, 0);
      disc(site.x, site.y, r + site.s, r - site.s, ring, 1, site.state === "new" ? 12 : 0, 0);
      if (site.state === "active") disc(site.x, site.y, r * 0.42, 0, pulse, 1, 0, 0);
      report.sites++;
    }
    const siteDiscs = discs.count;

    // The cut spark and the reconvergence ripple. With reduced motion they stand still.
    for (const effect of scene.effects) {
      const fade = 1 - effect.age;
      if (effect.kind === "spark") {
        const reach = scene.reducedMotion ? 26 : 12 + 40 * effect.age;
        for (let ray = 0; ray < 10; ray++) {
          const angle = (ray / 10) * Math.PI * 2 + 0.3;
          seg(effect.x + Math.cos(angle) * reach * 0.35, effect.y + Math.sin(angle) * reach * 0.35, effect.x + Math.cos(angle) * reach, effect.y + Math.sin(angle) * reach, 1.1, failure, 0.95 * fade, 0, 0, 1, 1, 0, 1);
        }
        disc(effect.x, effect.y, 5 * fade + 1, 0, pulse, 0.8 * fade, 0, 1);
      } else {
        const radius = scene.reducedMotion ? 70 : 30 + effect.age * Math.max(scene.width, scene.height) * 0.45;
        const half = (1 + 3 * fade) / 2;
        disc(effect.x, effect.y, radius + half, Math.max(0.1, radius - half), pulse, 0.6 * fade, 0, 1);
      }
      report.effects++;
    }
    if (scene.drag) {
      const color = scene.drag.affordable ? pulse : rgb01(p.congestion!);
      seg(scene.drag.ax, scene.drag.ay, scene.drag.bx, scene.drag.by, 1, color, 0.9, 7, 6, 1, 1, 0, 0);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.segBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, segs.data.subarray(0, segs.count * SEG_FLOATS), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.discBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, discs.data.subarray(0, discs.count * DISC_FLOATS), gl.DYNAMIC_DRAW);

    const drawSegs = (from: number, to: number, pass: number): void => {
      if (to <= from) return;
      gl.useProgram(this.segProgram);
      gl.uniform2f(gl.getUniformLocation(this.segProgram, "uSize"), this.width, this.height);
      gl.uniform1f(gl.getUniformLocation(this.segProgram, "uPass"), pass);
      gl.bindVertexArray(this.segVao);
      // Instance attributes start at the first instance of the range.
      gl.bindBuffer(gl.ARRAY_BUFFER, this.segBuffer);
      let offset = 0;
      [2, 2, 1, 4, 2, 2, 1, 1].forEach((size, i) => {
        gl.vertexAttribPointer(i + 1, size, gl.FLOAT, false, SEG_FLOATS * 4, (from * SEG_FLOATS + offset) * 4);
        offset += size;
      });
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, to - from);
    };
    const drawDiscs = (from: number, to: number, pass: number): void => {
      if (to <= from) return;
      gl.useProgram(this.discProgram);
      gl.uniform2f(gl.getUniformLocation(this.discProgram, "uSize"), this.width, this.height);
      gl.uniform1f(gl.getUniformLocation(this.discProgram, "uPass"), pass);
      gl.bindVertexArray(this.discVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.discBuffer);
      let offset = 0;
      [2, 1, 1, 4, 1, 1].forEach((size, i) => {
        gl.vertexAttribPointer(i + 1, size, gl.FLOAT, false, DISC_FLOATS * 4, (from * DISC_FLOATS + offset) * 4);
        offset += size;
      });
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, to - from);
    };
    const everything = (pass: number): void => {
      drawSegs(0, linkSegs, pass);
      drawSegs(linkSegs, trailSegs, pass);
      drawDiscs(0, pulseDiscs, pass);
      drawDiscs(pulseDiscs, siteDiscs, pass);
      drawSegs(trailSegs, segs.count, pass);
      drawDiscs(siteDiscs, discs.count, pass);
    };

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);

    // 1. The scene, each thing painted over the last, exactly as the fallback renderer does.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneTarget.framebuffer);
    gl.viewport(0, 0, this.sceneTarget.width, this.sceneTarget.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    everything(0);

    // 2. The light for the bloom, at half size.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.glowA.framebuffer);
    gl.viewport(0, 0, this.glowA.width, this.glowA.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFunc(gl.ONE, gl.ONE);
    everything(1);

    // 3. Blur it, across then down.
    gl.disable(gl.BLEND);
    gl.useProgram(this.blurProgram);
    gl.bindVertexArray(this.fullVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(gl.getUniformLocation(this.blurProgram, "uTex"), 0);
    const blur = (from: Target, to: Target, dx: number, dy: number): void => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.framebuffer);
      gl.viewport(0, 0, to.width, to.height);
      gl.bindTexture(gl.TEXTURE_2D, from.texture);
      gl.uniform2f(gl.getUniformLocation(this.blurProgram, "uStep"), dx / from.width, dy / from.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const spread = 2.4 * this.dpr;
    blur(this.glowA, this.glowB, spread, 0);
    blur(this.glowB, this.glowA, 0, spread);

    // 4. Put it together on screen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.compositeProgram);
    const uniform = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(this.compositeProgram, name);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.backdropTexture);
    gl.uniform1i(uniform("uBackdrop"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTarget.texture);
    gl.uniform1i(uniform("uScene"), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.glowA.texture);
    gl.uniform1i(uniform("uBloom"), 2);
    const sweep = rgb01(p.linkBright!);
    gl.uniform3f(uniform("uSweepColor"), sweep[0], sweep[1], sweep[2]);
    gl.uniform1f(uniform("uSweepX"), scene.sweep === null ? -1 : (scene.sweep * (scene.width + 300) - 150) / scene.width);
    gl.uniform1f(uniform("uSweepWidth"), 150 / scene.width);
    gl.uniform1f(uniform("uBloomStrength"), 1.5);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    return report;
  }
}
