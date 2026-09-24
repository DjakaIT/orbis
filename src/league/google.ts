/**
 * Google Identity Services, tanko omotan.
 *
 * Skripta se povlači tek kad se otvori panel lige — ne pri prvom otvaranju igre.
 * Igra radi bez lige, liga radi bez Googlea, pa nijedno ne smije platiti trećoj
 * strani prije nego ga netko zatraži.
 *
 * Bez `VITE_GOOGLE_CLIENT_ID` ovdje se ne događa ništa: `configured` je false i
 * sučelje gumb uopće ne pokaže. Client ID nije tajna — stoji u stranici kod svih
 * koji ovo koriste — a ono što štiti prijavu je provjera potpisa i publike na
 * poslužitelju, u `netlify/lib/google.ts`.
 */

/** Adresa knjižnice iz Googleove dokumentacije za Identity Services. */
const GIS_SRC = 'https://accounts.google.com/gsi/client';

export const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';

/** Ima li ovaj build podešenu prijavu. */
export const configured = CLIENT_ID.trim() !== '';

interface GoogleId {
  initialize(config: { client_id: string; callback: (r: { credential?: string }) => void }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard';
      theme?: 'outline' | 'filled_blue';
      size?: 'large' | 'medium';
      shape?: 'rectangular' | 'pill';
      text?: 'signin_with' | 'continue_with';
      locale?: string;
      width?: number;
    },
  ): void;
}

interface WithGoogle {
  google?: { accounts?: { id?: GoogleId } };
}

let loading: Promise<GoogleId | null> | null = null;

/**
 * Povuče knjižnicu jednom i vrati njezin `accounts.id`, ili `null`.
 *
 * `null` je ovdje uredan ishod, ne greška: skripta zna biti blokirana
 * proširenjem, mrežom ili načinom rada bez trećih strana. Liga tada radi preko
 * nadimka, kao i dosad.
 */
export function loadGoogle(): Promise<GoogleId | null> {
  if (!configured) return Promise.resolve(null);
  loading ??= inject();
  return loading;
}

function inject(): Promise<GoogleId | null> {
  const ready = (): GoogleId | null => (globalThis as WithGoogle).google?.accounts?.id ?? null;

  const existing = ready();
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => {
      resolve(ready());
    });
    script.addEventListener('error', () => {
      // Ne odbija se: pozivatelj treba „nema prijave", ne iznimku.
      resolve(null);
    });
    document.head.appendChild(script);
  });
}

/**
 * Nacrta Googleov gumb u zadani element i javi token kad ga korisnik da.
 *
 * Gumb mora biti Googleov, a ne naš s njihovim logom: izgled, tekst i ponašanje
 * propisuju njihova pravila, a `renderButton` ih zadovoljava bez razmišljanja.
 */
export async function mountGoogleButton(
  parent: HTMLElement,
  onCredential: (credential: string) => void,
): Promise<boolean> {
  const id = await loadGoogle();
  if (!id) return false;

  id.initialize({
    client_id: CLIENT_ID,
    callback: (response) => {
      if (response.credential) onCredential(response.credential);
    },
  });

  id.renderButton(parent, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    locale: 'hr',
  });

  return true;
}
