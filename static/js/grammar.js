/**
 * Grammar Insights & Pattern Matcher Engine for WordClick v2
 */

const GRAMMAR_PATTERNS = [
  {
    id: 'present-perfect-continuous',
    regex: /\b(have|has)\s+been\s+([a-z]+ing)\b/i,
    name: 'Present Perfect Continuous',
    formula: 'have / has been + verb-ing',
    explanation_pl: 'Używany do opisywania czynności, która rozpoczęła się w przeszłości i trwa nieprzerwanie do chwili obecnej lub jej skutki są widoczne teraz.',
    example_pl: 'np. "have been working" -> pracuję / pracowałem (od jakiegoś czasu)'
  },
  {
    id: 'past-perfect-continuous',
    regex: /\b(had)\s+been\s+([a-z]+ing)\b/i,
    name: 'Past Perfect Continuous',
    formula: 'had been + verb-ing',
    explanation_pl: 'Opisuje czynność, która trwała przez pewien czas w przeszłości, zanim wydarzyła się inna sytuacja w przeszłości.',
    example_pl: 'np. "had been waiting" -> czekałem (przez pewien czas, zanim ktoś przyszedł)'
  },
  {
    id: 'past-perfect',
    regex: /\b(had)\s+([a-z]+ed|known|done|seen|been|gone|taken|given|made|thought)\b/i,
    name: 'Past Perfect (Czas Zaprzeszły)',
    formula: 'had + III forma czasownika',
    explanation_pl: 'Używany do wyrażenia czynności, która zakończyła się ZANIM rozpoczęła się inna czynność w przeszłości.',
    example_pl: 'np. "had left" -> wyszedł (zanim coś innego się stało)'
  },
  {
    id: 'used-to',
    regex: /\bused\s+to\s+([a-z]+)\b/i,
    name: 'Used to (Past Habit / State)',
    formula: 'used to + bezokolicznik',
    explanation_pl: 'Wyraża nawyk lub stan z przeszłości, który już nie jest aktualny (kiedyś coś robiłem, ale już tego nie robię).',
    example_pl: 'np. "used to live" -> kiedyś mieszkałem (ale już nie mieszkam)'
  },
  {
    id: 'third-conditional-inversion',
    regex: /\bhad\s+I\s+([a-z]+ed|known|seen|been)\b/i,
    name: 'Inwersja w III Okresie Warunkowym',
    formula: 'Had I + III forma (zamiast "If I had...")',
    explanation_pl: 'Elegancka, oficjalna konstrukcja wyrażająca żal lub rozważanie przeszłości: "Gdybym tylko wiedział / gdybym zrobił...".',
    example_pl: 'np. "Had I known" -> Gdybym wiedział (wtedy)'
  },
  {
    id: 'passive-voice',
    regex: /\b(is|are|was|were|been|being)\s+([a-z]+ed|reviewed|aligned|implemented|discussed|launched|built|made)\b/i,
    name: 'Passive Voice (Strona Bierna)',
    formula: 'be + III forma / -ed',
    explanation_pl: 'Stosowana, gdy wykonawca czynności jest mniej ważny niż sam obiekt lub efekt działania (np. w prasie, nauce i biznesie).',
    example_pl: 'np. "is being implemented" -> jest wdrażany'
  },
  {
    id: 'modal-past',
    regex: /\b(should|could|would|might|must)\s+have\s+([a-z]+ed|known|seen|done|been)\b/i,
    name: 'Czasowniki Modalne w Przeszłości',
    formula: 'modal + have + III forma',
    explanation_pl: 'Służą do oceny lub spekulacji na temat przeszłości (np. "powinienem był zrobić", "mogło się stać").',
    example_pl: 'np. "should have known" -> powinienem był wiedzieć'
  }
];

export function detectGrammarInsights(word, sentence) {
  if (!sentence) return null;

  for (const pattern of GRAMMAR_PATTERNS) {
    const match = sentence.match(pattern.regex);
    if (match) {
      const matchedPhrase = match[0];
      // Check if clicked word is near or inside this grammar construction
      if (sentence.toLowerCase().includes(word.toLowerCase())) {
        return {
          id: pattern.id,
          name: pattern.name,
          matchedPhrase: matchedPhrase,
          formula: pattern.formula,
          explanation_pl: pattern.explanation_pl,
          example_pl: pattern.example_pl
        };
      }
    }
  }

  return null;
}
