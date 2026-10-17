import type { Category } from '@streeteats/shared';

// Short demo review texts, in the language a customer might actually write.
export const REVIEW_TEXT: Partial<Record<Category, string[]>> & { any: string[] } = {
  hot_dogs: [
    'Best bacon-wrapped dog I have had in LA. Those grilled onions!',
    'El mejor jocho después del partido. Muy amables.',
    'Fast, hot and cheap. Exactly what you want at midnight.',
    'Los chiles toreados están buenísimos.',
  ],
  tacos: [
    'Pastor straight off the trompo. Salsa verde is fire.',
    'Tacos bien servidos y la salsa roja pica rico.',
    'Worth the line. Get the suadero.',
    'Como en México. Volveré.',
  ],
  flowers: [
    'Beautiful bouquet for my mom, and a great price.',
    'Las rosas duraron toda la semana. Muy bonitas.',
    'Saved my anniversary. Thank you!',
  ],
  elote: [
    'Esquites with extra lime. Perfect.',
    'El elote con Hot Cheetos es lo máximo.',
    'Generous cup, real cotija.',
  ],
  fruit: [
    'Super fresh fruit, the mangonada is amazing.',
    'La fruta bien fresca y con mucho chamoy.',
    'Perfect on a hot day.',
  ],
  churros: ['Churros hot out of the oil, crispy outside and soft inside.', 'Los rellenos de cajeta son mis favoritos.', 'My kids love this cart.'],
  tamales: ['Tamales de puerco como los de mi abuela.', 'Champurrado on a cold morning, perfect.', 'Get there early, they sell out!'],
  pupusas: ['Pupusas revueltas bien rellenas. El curtido, delicioso.', 'Best pupusas in Pico-Union.'],
  snacks: ['Hotteok is crispy and sweet. So good.', 'Tteokbokki is the real deal.'],
  any: ['Friendly and fast. Recommended.', 'Muy buen servicio.', 'Great value.', 'Muy rico todo.', 'Will be back!'],
};
