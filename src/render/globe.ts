/**
 * Scena globusa, imperativno. SPEC §6.1.
 *
 * Jedna sfera s jednom teksturom i bez svjetla — boje su podatak i ne smiju
 * ovisiti o kutu osvjetljenja. Kontrole su vlastite: `OrbitControls` iz
 * `three/examples` donosi zoom, pan i inerciju koje ne trebamo.
 */

import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';

import { GlobeTexture, type Tokens } from './texture';

const STAR_COUNT = 800;
const STAR_RADIUS = 40;
const AUTO_ROTATE = 0.0026; // ≈ 0,15° po frameu
const DRAG_SENSITIVITY = 0.005;
const MAX_PITCH = Math.PI / 2 - 0.05;

/** Trajanje okretanja prema meti pri pogotku. SPEC §6.1. */
const CENTRE_MS = 900;
/** Trajanje ulijevanja boje u drzavu. SPEC §2.5. */
export const FILL_MS = 420;

const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

function reducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

interface Spin {
  from: { yaw: number; pitch: number };
  to: { yaw: number; pitch: number };
  started: number;
}

export class Globe {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly sphere: Mesh;
  private readonly texture: CanvasTexture;
  private readonly painter: GlobeTexture;

  private yaw = 0;
  private pitch = 0;
  private auto = true;
  private spin: Spin | null = null;
  private frame = 0;
  private disposed = false;

  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  private readonly host: HTMLElement;

  constructor(host: HTMLElement, tokens: Tokens) {
    this.host = host;
    this.painter = new GlobeTexture(tokens);

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 2));
    this.host.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0, 0, 3.2);

    this.texture = new CanvasTexture(this.painter.canvas);
    // Bez ovoga three tretira teksturu kao linearnu i globus ispadne ispran.
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    this.sphere = new Mesh(
      new SphereGeometry(1, 96, 96),
      new MeshBasicMaterial({ map: this.texture }),
    );
    this.scene.add(this.sphere);
    this.scene.add(stars(tokens.hairline));

    this.attach();
    this.resize();
    this.loop();
  }

  /** Crta osnovnu teksturu. Zove se jednom, kad podaci stignu. */
  setShapes(shapes: Map<string, GeoJSON.Geometry>): void {
    this.painter.paintBase(shapes);
    this.texture.needsUpdate = true;
  }

  /** Preboja drzavu bez animacije — koristi se pri obnovi stanja iz localStorage. */
  paint(code: string, color: string): void {
    if (this.painter.paintCountry(code, color)) this.texture.needsUpdate = true;
  }

  /**
   * Boja se ulijeva u drzavu kroz 420 ms. Jedini orkestrirani trenutak u igri.
   * Uz `prefers-reduced-motion` boja upada odmah. SPEC §2.5.
   */
  fill(code: string, color: string): void {
    if (reducedMotion()) {
      this.paint(code, color);
      return;
    }
    const started = performance.now();
    const step = (): void => {
      if (this.disposed) return;
      const t = Math.min((performance.now() - started) / FILL_MS, 1);
      // cubic-bezier(0.2, 0, 0, 1) — brz start, mekan doskok.
      this.painter.paintCountry(code, color, easeOut(t));
      this.texture.needsUpdate = true;
      if (t < 1) requestAnimationFrame(step);
    };
    step();
  }

  /**
   * Okrece globus dok meta ne dode u sredinu. Jedina nagrada za pogodak uz
   * samu boju — bez konfeta. SPEC §2.5.
   */
  centreOn(lat: number, lon: number): void {
    this.auto = false;
    /*
     * Pri yaw = 0 kamera gleda u lon −90: `SphereGeometry` slaže u = 0,25 prema
     * +z, a tekstura mapira u = (lon + 180) / 360. Odatle yaw = −(lon + 90).
     */
    const to = { yaw: -((lon + 90) * Math.PI) / 180, pitch: (lat * Math.PI) / 180 };

    if (reducedMotion()) {
      this.yaw = to.yaw;
      this.pitch = to.pitch;
      return;
    }

    // Najkraci put: normaliziraj razliku u [-π, π].
    let delta = (to.yaw - this.yaw) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;

    this.spin = {
      from: { yaw: this.yaw, pitch: this.pitch },
      to: { yaw: this.yaw + delta, pitch: to.pitch },
      started: performance.now(),
    };
  }

  resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.detach();
    this.texture.dispose();
    this.sphere.geometry.dispose();
    (this.sphere.material as MeshBasicMaterial).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /* ------------------------------------------------------------- kontrole */

  private readonly onDown = (e: PointerEvent): void => {
    this.dragging = true;
    // Blago auto-rotiranje staje na prvi dodir i ne vraca se. SPEC §6.1.
    this.auto = false;
    this.spin = null;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.yaw += (e.clientX - this.lastX) * DRAG_SENSITIVITY;
    this.pitch = clamp(
      this.pitch + (e.clientY - this.lastY) * DRAG_SENSITIVITY,
      -MAX_PITCH,
      MAX_PITCH,
    );
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private readonly onUp = (e: PointerEvent): void => {
    this.dragging = false;
    if (this.renderer.domElement.hasPointerCapture(e.pointerId)) {
      this.renderer.domElement.releasePointerCapture(e.pointerId);
    }
  };

  private attach(): void {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
  }

  private detach(): void {
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onUp);
  }

  private readonly loop = (): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);

    if (this.spin) {
      const t = Math.min((performance.now() - this.spin.started) / CENTRE_MS, 1);
      const k = easeOut(t);
      this.yaw = this.spin.from.yaw + (this.spin.to.yaw - this.spin.from.yaw) * k;
      this.pitch = this.spin.from.pitch + (this.spin.to.pitch - this.spin.from.pitch) * k;
      if (t >= 1) this.spin = null;
    } else if (this.auto && !reducedMotion()) {
      this.yaw += AUTO_ROTATE;
    }

    this.sphere.rotation.y = this.yaw;
    this.sphere.rotation.x = this.pitch;
    this.renderer.render(this.scene, this.camera);
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** 800 tocaka ravnomjerno po sferi radijusa 40. SPEC §6.1. */
function stars(color: string): Points {
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    // Ravnomjerno po povrsini: z uniformno, kut uniformno. Bez toga se
    // tocke zgusnu oko polova.
    const z = 2 * ((i + 0.5) / STAR_COUNT) - 1;
    const r = Math.sqrt(1 - z * z);
    const phi = i * 2.399963; // zlatni kut
    positions[i * 3] = STAR_RADIUS * r * Math.cos(phi);
    positions[i * 3 + 1] = STAR_RADIUS * r * Math.sin(phi);
    positions[i * 3 + 2] = STAR_RADIUS * z;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return new Points(geometry, new PointsMaterial({ color: new Color(color), size: 0.22 }));
}
