/**
 * Scena globusa, imperativno. SPEC §6.1.
 *
 * Jedna sfera s jednom teksturom i bez svjetla — boje su podatak i ne smiju
 * ovisiti o kutu osvjetljenja. Kontrole su vlastite: `OrbitControls` iz
 * `three/examples` donosi zoom, pan i inerciju koje ne trebamo.
 */

import type { Material } from 'three';
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';

import { GlobeTexture, type Tokens } from './texture';

/** Koliko se tocaka uzme po luku izmedu dva pokusaja. */
const ARC_STEPS = 48;
/** Trag i tocke lebde tik iznad povrsine, da ih sfera ne proguta. */
const TRAIL_RADIUS = 1.004;
const NODE_RADIUS = 1.006;

const AUTO_ROTATE = 0.0026; // ≈ 0,15° po frameu
const DRAG_SENSITIVITY = 0.005;
const MAX_PITCH = Math.PI / 2 - 0.05;

/** Vertikalni kut kamere. */
const FOV = 38;
/**
 * Koliki dio **krace** poluosi zauzima kugla pri punom kadru.
 *
 * Jedinica bi znacila da rub sfere pada tocno na rub, bez ijednog piksela zraka —
 * i tako je bilo 2026-09-17. Na stvarnim ekranima se kugla ondje ipak rezala sa
 * strana: `clientWidth` je zaokruzen na cijeli piksel, a oreol i sjena trebaju
 * mjesta izvan ruba. Pojas od 12 % je ta rezerva.
 *
 * Velicina vise nije kompromis jer postoji zum: tko zeli blize, primakne se.
 */
const FILL = 0.88;

/**
 * Raspon zuma. 1 je cijela kugla u kadru.
 *
 * Gornja granica je vezana uz teksturu, ne uz geometriju: kugla se na ekranu
 * crta na oko 400 px, a vidljiva polutka nosi 1024 od 2048 stupaca teksture, pa
 * je na cetverostrukom zumu omjer vec ispod jedan teksel po pikselu. Na osam je
 * slika bila vidljivo mutna.
 */
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/** Koliko jedan zarez kotacica mijenja zum. Eksponencijalno, vidi `onWheel`. */
const WHEEL_SENSITIVITY = 0.0015;

/**
 * Koliko daleko kamera mora stajati da kugla stane cijela.
 *
 * Kamera ima **vertikalni** kut, pa je na uspravnom ekranu sirina ono sto
 * ogranicava: pri fov = 38° i z = 3,2 vidljiva poluvisina je 1,10, a polusirina
 * je to puta omjer. Cim je omjer uzi od 0,908 polusirina padne ispod polumjera
 * kugle i ekran joj odsijece lijevu i desnu stranu — sto se na mobitelu i
 * dogadalo, jer mu je omjer oko 0,84.
 *
 * Zato se kamera odmakne tocno onoliko koliko uza os trazi. Na sirokom ekranu
 * `max` uzme jedinicu i ispadne dosadasnjih 3,2, pa se ondje nista ne mijenja.
 */
export function cameraDistance(aspect: number, fov = FOV): number {
  return Math.max(1, 1 / aspect) / (FILL * Math.tan((fov * Math.PI) / 360));
}

/**
 * Kut objektiva za zadani zum, u stupnjevima.
 *
 * Teleobjektiv: kamera stoji na mjestu, a uzi kut povecava ono sto vidi. Time
 * kamera nikad ne ude u kuglu, sto se s primicanjem dogadalo — pri zumu 8 je
 * padala na z = 0,41 uz polumjer 1 i globus bi nestao.
 */
export function zoomedFov(zoom: number, fov = FOV): number {
  return (Math.atan(Math.tan((fov * Math.PI) / 360) / zoom) * 360) / Math.PI;
}

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
  /** Trag pokusaja. Dijete sfere, pa se okrece zajedno s njom. */
  private readonly trail = new Group();
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

  /** Zum: 1 je cijela kugla u kadru, vise znaci blize. */
  private zoom = MIN_ZOOM;

  /** Aktivni dodiri, za stiskanje s dva prsta. */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchStart = 0;
  private pinchZoom = MIN_ZOOM;

  private readonly host: HTMLElement;

  constructor(host: HTMLElement, tokens: Tokens) {
    this.host = host;
    this.painter = new GlobeTexture(tokens);

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 2));
    this.host.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
    this.camera.position.set(0, 0, cameraDistance(1));

    this.texture = new CanvasTexture(this.painter.canvas);
    // Bez ovoga three tretira teksturu kao linearnu i globus ispadne ispran.
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    this.sphere = new Mesh(
      new SphereGeometry(1, 96, 96),
      new MeshBasicMaterial({ map: this.texture }),
    );
    this.sphere.add(this.trail);
    this.scene.add(this.sphere);

    this.attach();
    this.resize();
    this.loop();
  }

  /**
   * Trag kroz pokusaje, kronoloski, od prvog do zadnjeg.
   *
   * Luk ide po velikoj kruznici — najkraci put po kugli, isti onaj koji mjeri
   * udaljenost. Ravna crta izmedu dvije tocke probila bi sferu i izasla s druge
   * strane, pa se hoda slerpom kroz `ARC_STEPS` koraka.
   *
   * Grupa je dijete sfere, pa nasljeduje njezinu rotaciju i drzi se kopna. Sfera
   * je neprozirna i dubinski test radi, pa dio traga na drugoj strani planeta
   * nestaje iza njega — tocno kako i treba.
   *
   * Trag je jedne boje, ne u boji udaljenosti. Put nije udaljenost: udaljenost
   * vec nosi ispuna drzave i traka u listi, a obojan trag preko obojane drzave
   * jednostavno nestane. Ovako je linija chrome, a boja ostaje podatak.
   */
  setTrail(path: { lat: number; lon: number }[], color: string): void {
    this.trail.clear();
    if (path.length === 0) return;

    for (const point of path) {
      this.trail.add(node(point, NODE_RADIUS, color));
    }

    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1];
      const to = path[i];
      if (!from || !to) continue;
      this.trail.add(arc(from, to, color));
    }
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
    // Kugla mora stati i po sirini, ne samo po visini. Vidi `cameraDistance`.
    // `setZoom` postavlja udaljenost i zadrzava trenutni zum kroz promjenu okvira.
    this.setZoom(this.zoom);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.detach();
    this.texture.dispose();
    disposeTrail(this.trail);
    this.sphere.geometry.dispose();
    (this.sphere.material as MeshBasicMaterial).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /* ------------------------------------------------------------- kontrole */

  /**
   * Postavlja zum. 1 je cijela kugla u kadru, vise znaci blize.
   *
   * Zumira se **suzavanjem kuta objektiva**, ne primicanjem kamere. Primicanje
   * je na velikom zumu kameru uvuklo unutar kugle — polumjer je 1, a kamera je
   * pri osmerostrukom zumu pala na z = 0,41 i globus je s ekrana nestao. Kamera
   * zato ostaje gdje jest, a mijenja se `fov`, kao teleobjektiv.
   *
   * Rotacija se usporava razmjerno zumu: pri peterostrukom priblizavanju isti
   * pomak prsta prelazi peterostruko manje stupnjeva, inace drzava odleti van
   * kadra prije nego je igrac stigne pogledati.
   */
  setZoom(next: number): void {
    this.zoom = clamp(next, MIN_ZOOM, MAX_ZOOM);
    this.camera.position.z = cameraDistance(this.camera.aspect);
    this.camera.fov = zoomedFov(this.zoom);
    this.camera.updateProjectionMatrix();
  }

  get zoomLevel(): number {
    return this.zoom;
  }

  private readonly onDown = (e: PointerEvent): void => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Blago auto-rotiranje staje na prvi dodir i ne vraca se. SPEC §6.1.
    this.auto = false;
    this.spin = null;

    if (this.pointers.size === 2) {
      this.pinchStart = this.pointerSpread();
      this.pinchZoom = this.zoom;
    }

    this.dragging = this.pointers.size === 1;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Dva prsta znace stiskanje, ne vrtnju.
    if (this.pointers.size >= 2) {
      const spread = this.pointerSpread();
      if (this.pinchStart > 0) this.setZoom((this.pinchZoom * spread) / this.pinchStart);
      return;
    }

    if (!this.dragging) return;
    const speed = DRAG_SENSITIVITY / this.zoom;
    this.yaw += (e.clientX - this.lastX) * speed;
    this.pitch = clamp(this.pitch + (e.clientY - this.lastY) * speed, -MAX_PITCH, MAX_PITCH);
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private readonly onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.dragging = false;
    this.pinchStart = 0;
    if (this.renderer.domElement.hasPointerCapture(e.pointerId)) {
      this.renderer.domElement.releasePointerCapture(e.pointerId);
    }
  };

  /**
   * Kotacic mijenja zum. `preventDefault` je nuzan da se stranica ne pomakne
   * ispod pokazivaca, pa slusac mora biti `passive: false`.
   */
  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.auto = false;
    this.spin = null;
    // Eksponencijalno: svaki korak mnozi, pa je osjecaj jednak na svakom zumu.
    this.setZoom(this.zoom * Math.exp(-e.deltaY * WHEEL_SENSITIVITY));
  };

  /** Razmak izmedu prva dva prsta, u pikselima. */
  private pointerSpread(): number {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private attach(): void {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private detach(): void {
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onUp);
    el.removeEventListener('wheel', this.onWheel);
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

/**
 * Tocka na sferi iz zemljopisnih koordinata, u lokalnom sustavu `SphereGeometry`.
 *
 * Mora pratiti isto mapiranje kojim se slika tekstura, inace bi trag stajao
 * pokraj drzave koju oznacava: `u = (lon + 180) / 360` i `v = (90 - lat) / 180`,
 * a three slaze vrh kao `(-cos φ sin θ, cos θ, sin φ sin θ)`.
 */
function onSphere(lat: number, lon: number, radius: number): Vector3 {
  const phi = ((lon + 180) * Math.PI) / 180;
  const theta = ((90 - lat) * Math.PI) / 180;
  return new Vector3(
    -Math.cos(phi) * Math.sin(theta) * radius,
    Math.cos(theta) * radius,
    Math.sin(phi) * Math.sin(theta) * radius,
  );
}

/** Mala oznaka na mjestu pokusaja. */
function node(point: { lat: number; lon: number }, radius: number, color: string): Points {
  const geometry = new BufferGeometry();
  const p = onSphere(point.lat, point.lon, radius);
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([p.x, p.y, p.z]), 3));
  return new Points(
    geometry,
    new PointsMaterial({ color: new Color(color), size: 0.038, sizeAttenuation: true }),
  );
}

/** Luk velike kruznice izmedu dva pokusaja. */
function arc(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  color: string,
): Line {
  const a = onSphere(from.lat, from.lon, 1).normalize();
  const b = onSphere(to.lat, to.lon, 1).normalize();

  const positions = new Float32Array((ARC_STEPS + 1) * 3);
  for (let i = 0; i <= ARC_STEPS; i++) {
    // Slerp, ne linearna interpolacija: ova druga bi presjekla kuglu.
    const point = slerp(a, b, i / ARC_STEPS).multiplyScalar(TRAIL_RADIUS);
    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return new Line(
    geometry,
    new LineBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.85 }),
  );
}

/**
 * Sferna interpolacija dvaju jedinicnih vektora.
 *
 * Kad su gotovo poklopljeni ili gotovo suprotni, `sin` u nazivniku ide u nulu i
 * racun se raspada; tada se pada na linearnu interpolaciju, gdje je razlika
 * ionako ispod piksela.
 */
function slerp(a: Vector3, b: Vector3, t: number): Vector3 {
  const dot = clamp(a.dot(b), -1, 1);
  const omega = Math.acos(dot);
  const sin = Math.sin(omega);
  if (sin < 1e-6) return a.clone().lerp(b, t).normalize();

  return a
    .clone()
    .multiplyScalar(Math.sin((1 - t) * omega) / sin)
    .add(b.clone().multiplyScalar(Math.sin(t * omega) / sin));
}

/**
 * Otpusta geometriju i materijal svakog djeteta traga.
 *
 * `material` je u tipovima unija jednog materijala i niza, pa se normalizira —
 * ovdje je uvijek jedan, ali tip to ne zna i ne treba mu vjerovati na rijec.
 */
function disposeTrail(group: Group): void {
  for (const child of group.children) {
    if (!(child instanceof Line) && !(child instanceof Points)) continue;

    /*
     * `Line` i `Points` su u tipovima generici, pa im pristup poljima bez
     * argumenata tipa ispadne `any`. Anotacija je ovdje tvrdnja o onome sto
     * ova funkcija sama slaze nekoliko redaka iznad.
     */
    const geometry = child.geometry as BufferGeometry;
    const material = child.material as Material | Material[];

    geometry.dispose();
    for (const one of Array.isArray(material) ? material : [material]) one.dispose();
  }
  group.clear();
}
