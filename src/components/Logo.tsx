/**
 * Marca do Contatta. Fica num componente só para o menu, o login e o favicon
 * não saírem de sincronia — o SVG estava copiado em cada tela.
 *
 * O desenho é o mesmo de public/favicon.svg; se mexer em um, mexa no outro.
 */
export default function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Contatta">
      <defs>
        <linearGradient id="logo-c" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b57ea" />
          <stop offset="1" stopColor="#4a31d0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7.2" fill="url(#logo-c)" />
      <path
        d="M21 12.4A5.6 5.6 0 1 0 21 19.6"
        fill="none"
        stroke="#fff"
        strokeWidth="4.3"
        strokeLinecap="round"
      />
      <circle cx="19.35" cy="16" r="1.85" fill="#a5b4fc" />
    </svg>
  )
}
