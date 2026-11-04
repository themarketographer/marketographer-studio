// Plantillas de prompt. Cada formato define su estructura; las reglas de voz son comunes.
// Para agregar un formato nuevo: añade una entrada en FORMATOS y aparecerá en la interfaz.

export const FORMATOS = {
  'talking-head': {
    nombre: 'Talking Head',
    duracion: '30 a 45 segundos, entre 80 y 110 palabras',
    resumen: 'Tú a cámara, un tema, subtítulos animados.',
    estructura: [
      'Apertura con una pregunta que duele, una afirmación que provoca rechazo o una confesión con gancho. Nunca saludo ni contexto.',
      'Dos o tres escalones cortos que suben de peso. Cada uno sirve a la misma idea.',
      'Una analogía con un mundo distinto a la fotografía, que regrese explícitamente al fotógrafo.',
      'Cierre con una pregunta real que invite a comentar.',
    ],
    marcas: 'Marca con *asteriscos* las palabras que deben salir en grande en pantalla (máximo 6 en todo el guion). Marca con [ZOOM] los momentos de golpe y con [SFX: click] o [SFX: whoosh] los sonidos. Estas marcas las leerá el editor automático en el futuro.',
  },
  'pro-vs-noob': {
    nombre: 'Pro vs Noob',
    duracion: '35 a 50 segundos, entre 8 y 12 intervenciones cortas',
    resumen: 'Tú contigo mismo: un novato pregunta, un pro responde.',
    estructura: [
      'Diálogo con NOVATO y PRO alternando. Cada intervención de máximo 15 palabras.',
      'El NOVATO abre con un error o una creencia común dicha con total seguridad.',
      'El PRO responde con una pregunta o un dato concreto, nunca con un sermón.',
      'Un remate con humor negro o sarcasmo en la penúltima línea.',
      'Cierre del PRO con una pregunta real al espectador.',
    ],
    marcas: 'Escribe cada línea como "NOVATO:" o "PRO:". Marca con *asteriscos* las palabras en grande. Indica [CORTE] cuando haya cambio de personaje con pausa.',
  },
  storytelling: {
    nombre: 'Storytelling',
    duracion: '60 a 75 segundos, narrado, sin actuar',
    resumen: 'Historia al estilo Alborna con dos escenas y una transición.',
    estructura: [
      'Una sola idea que nace del choque entre dos temas que no se parecen. Nómbrala en una línea antes de escribir.',
      'Hook con una escena cotidiana y una pregunta que el espectador cree poder responder.',
      'ESCENA 1 y ESCENA 2, cada una con su narración y su prompt de imagen del hombre cabeza de cámara.',
      'TRANSICIÓN entre escenas en una frase.',
      'Cierre que cierra exactamente lo que abrió el hook, con una pregunta real para comentar.',
    ],
    marcas: 'Para cada escena entrega: NARRACIÓN, IMAGEN (prompt en inglés del hombre cabeza de cámara, con fondo, luz y ángulo), MOVIMIENTO (qué capa se mueve y hacia dónde en el parallax).',
  },
};

const REGLAS_VOZ = `VOZ DE PABLO VILLARROEL (The Marketographer):
- Español latino, tuteo, coloquial pero preciso. Provocador con fundamento.
- Frases cortas en los golpes, más largas para construir tensión.
- Humor negro, sarcasmo y juegos de palabras cerrados (las dos lecturas son verdaderas y la revelación va en la última palabra).
- Todo símil debe ser explicativo y literal: se puede decir "esto significa que ___ porque ___".
- Datos y anécdotas personales solo los que yo te dé. Si falta uno, deja [DATO REAL: lo que falta].

PROHIBIDO:
- Cualquier contraposición que niega algo y lo reemplaza en la misma frase (No es X, es Y / No es que X, es que Y / No solo X sino Y / Más que X, Y / Ya no X, ahora Y). Afirma directo lo que es verdad.
- Guion largo, guion medio y símbolos que nadie usaría en una conversación normal.
- Palabras de relleno de IA: crucial, fundamental, holístico, potenciar, profundizar, impulsar, panorama, transformador.
- Aperturas con "Hoy vamos a hablar de" o saludos.
- Bullets dentro del guion hablado. El guion va en prosa.`;

export function construirPrompt({ tema, clase, formato }) {
  const f = FORMATOS[formato];
  if (!f) throw new Error('Formato desconocido');
  const material = clase?.resumen
    ? `MATERIAL DE LA CLASE "${clase.titulo}":\n${clase.resumen}`
    : clase ? `CLASE DE ORIGEN: "${clase.titulo}" (sin resumen guardado).` : '';
  const preguntas = clase?.preguntas?.length
    ? `PREGUNTAS REALES DE LOS ALUMNOS EN ESA CLASE:\n${clase.preguntas.map((q) => `- ${q}`).join('\n')}`
    : '';
  return `Escribe un guion de ${f.nombre} para TikTok y Reels.

TEMA: ${tema.titulo}
${tema.angulo ? `ÁNGULO QUE QUIERO: ${tema.angulo}\n` : ''}DURACIÓN: ${f.duracion}

${material}
${preguntas}

ESTRUCTURA:
${f.estructura.map((e, i) => `${i + 1}. ${e}`).join('\n')}

MARCAS DE EDICIÓN:
${f.marcas}

${REGLAS_VOZ}

ANTES DE ENTREGAR: revisa que no exista ninguna contraposición correctiva, que no haya guiones, que la apertura no sea un saludo y que el cierre sea una pregunta real. Entrega solo el guion final, sin comentarios.`;
}
