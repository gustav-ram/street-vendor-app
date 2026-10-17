import type { Category } from '@streeteats/shared';

// Reference data (not demo data): kept by `seed:clear`.
// Synonyms are normalized when inserted, so accents and casing don't matter
// here. A phrase may point at several tags: "la style hot dog" matches
// bacon-wrapped, Danger Dog and Sonoran dog vendors alike.

export interface TagSeed {
  slug: string;
  en: string;
  es: string;
  category?: Category;
  synonyms: string[];
}

const LA_STYLE = ['la style hot dog', 'la style hot dogs', 'la hot dog', 'los angeles hot dog', 'la street dog', 'street dog'];

export const TAGS: TagSeed[] = [
  // ---- hot dogs
  {
    slug: 'hot-dog',
    en: 'Hot dog',
    es: 'Hot dog',
    category: 'hot_dogs',
    synonyms: ['hot dog', 'hot dogs', 'hotdog', 'hotdogs', 'perro caliente', 'perros calientes', 'jocho', 'jochos', 'dogo', 'dogos', 'salchicha'],
  },
  {
    slug: 'bacon-wrapped-hot-dog',
    en: 'Bacon-wrapped hot dog',
    es: 'Hot dog envuelto en tocino',
    category: 'hot_dogs',
    synonyms: [...LA_STYLE, 'bacon wrapped hot dog', 'bacon wrapped', 'bacon dog', 'bacon hot dog', 'hot dog con tocino', 'jocho con tocino', 'dogo con tocino', 'perro caliente con tocino', 'perros con tocino', 'tocino'],
  },
  {
    slug: 'danger-dog',
    en: 'Danger Dog',
    es: 'Danger Dog',
    category: 'hot_dogs',
    synonyms: [...LA_STYLE, 'danger dog', 'danger dogs'],
  },
  {
    slug: 'sonoran-dog',
    en: 'Sonoran dog',
    es: 'Dogo sonorense',
    category: 'hot_dogs',
    synonyms: [...LA_STYLE, 'sonoran dog', 'sonoran hot dog', 'sonora dog', 'dogo sonorense', 'hot dog estilo sonora', 'estilo sonora'],
  },
  {
    slug: 'grilled-onions-peppers',
    en: 'Grilled onions & peppers',
    es: 'Cebolla y chiles asados',
    category: 'hot_dogs',
    synonyms: ['grilled onions', 'grilled peppers', 'cebolla asada', 'cebollitas', 'chiles toreados'],
  },
  // ---- tacos
  { slug: 'tacos', en: 'Tacos', es: 'Tacos', category: 'tacos', synonyms: ['taco', 'tacos', 'taqueria', 'taquero'] },
  { slug: 'al-pastor', en: 'Al pastor', es: 'Al pastor', category: 'tacos', synonyms: ['al pastor', 'pastor', 'trompo', 'tacos al pastor'] },
  { slug: 'suadero', en: 'Suadero', es: 'Suadero', category: 'tacos', synonyms: ['suadero', 'tacos de suadero'] },
  {
    slug: 'tacos-de-canasta',
    en: 'Basket tacos',
    es: 'Tacos de canasta',
    category: 'tacos',
    synonyms: ['tacos de canasta', 'basket tacos', 'tacos sudados', 'canasta'],
  },
  { slug: 'birria', en: 'Birria', es: 'Birria', category: 'tacos', synonyms: ['birria', 'quesabirria', 'quesabirrias', 'consome', 'birria tacos'] },
  {
    slug: 'mariscos',
    en: 'Seafood',
    es: 'Mariscos',
    category: 'tacos',
    synonyms: ['mariscos', 'seafood', 'fish tacos', 'fish taco', 'tacos de pescado', 'shrimp tacos', 'tacos de camaron', 'ceviche', 'tostada de ceviche', 'aguachile'],
  },
  {
    slug: 'oaxacan',
    en: 'Oaxacan',
    es: 'Oaxaqueño',
    synonyms: ['oaxacan', 'oaxaqueno', 'oaxaquena', 'oaxaca', 'tlayuda', 'tlayudas', 'memelas', 'memela', 'tasajo', 'quesillo'],
  },
  { slug: 'vegetarian', en: 'Vegetarian options', es: 'Opciones vegetarianas', synonyms: ['vegetarian', 'vegetariano', 'vegetariana', 'veggie', 'sin carne'] },
  { slug: 'vegan', en: 'Vegan options', es: 'Opciones veganas', synonyms: ['vegan', 'vegano', 'vegana', 'plant based'] },
  // ---- flowers
  {
    slug: 'flowers',
    en: 'Flowers',
    es: 'Flores',
    category: 'flowers',
    synonyms: ['flowers', 'flower', 'flores', 'flor', 'bouquet', 'bouquets', 'ramo', 'ramos', 'ramo de flores', 'florist'],
  },
  { slug: 'roses', en: 'Roses', es: 'Rosas', category: 'flowers', synonyms: ['roses', 'rose', 'rosas', 'rosa', 'rose bouquet', 'ramo de rosas', 'dozen roses', 'docena de rosas'] },
  { slug: 'sunflowers', en: 'Sunflowers', es: 'Girasoles', category: 'flowers', synonyms: ['sunflowers', 'sunflower', 'girasoles', 'girasol'] },
  {
    slug: 'graduation-bouquets',
    en: 'Graduation & party bouquets',
    es: 'Ramos para graduación y fiestas',
    category: 'flowers',
    synonyms: ['graduation flowers', 'graduation bouquet', 'flores de graduacion', 'ramo buchon', 'ramo de graduacion', 'money bouquet'],
  },
  // ---- elote
  {
    slug: 'elote',
    en: 'Elote',
    es: 'Elote',
    category: 'elote',
    synonyms: ['elote', 'elotes', 'corn', 'corn on the cob', 'mexican street corn', 'street corn', 'elote asado'],
  },
  {
    slug: 'esquites',
    en: 'Esquites (corn cup)',
    es: 'Esquites',
    category: 'elote',
    synonyms: ['esquites', 'esquite', 'corn cup', 'corn in a cup', 'elote en vaso', 'vasito de elote', 'elote preparado'],
  },
  {
    slug: 'hot-cheetos-elote',
    en: 'Hot Cheetos elote',
    es: 'Elote con Hot Cheetos',
    category: 'elote',
    synonyms: ['hot cheetos elote', 'elote con hot cheetos', 'flamin hot elote', 'hot cheetos', 'takis elote'],
  },
  // ---- fruit
  {
    slug: 'fruit-cup',
    en: 'Fruit cup',
    es: 'Vaso de fruta',
    category: 'fruit',
    synonyms: ['fruit cup', 'fruit cups', 'fruit', 'cut fruit', 'fresh fruit', 'fruta', 'fruta picada', 'vaso de fruta', 'coctel de fruta', 'frutas'],
  },
  { slug: 'mangonada', en: 'Mangonada', es: 'Mangonada', category: 'fruit', synonyms: ['mangonada', 'mangonadas', 'chamoyada', 'mango chamoy'] },
  {
    slug: 'mango-flower',
    en: 'Mango on a stick',
    es: 'Mango en palito',
    category: 'fruit',
    synonyms: ['mango on a stick', 'mango flower', 'mango flor', 'mango en palito', 'mango con chile', 'mango'],
  },
  { slug: 'coconut', en: 'Coconut', es: 'Coco', category: 'fruit', synonyms: ['coconut', 'coconut water', 'coco', 'coco frio', 'agua de coco'] },
  { slug: 'tajin-chamoy', en: 'Tajín & chamoy', es: 'Tajín y chamoy', category: 'fruit', synonyms: ['tajin', 'chamoy', 'chile y limon', 'chile limon', 'miguelito'] },
  // ---- churros
  { slug: 'churros', en: 'Churros', es: 'Churros', category: 'churros', synonyms: ['churro', 'churros', 'churreria'] },
  {
    slug: 'filled-churros',
    en: 'Filled churros',
    es: 'Churros rellenos',
    category: 'churros',
    synonyms: ['filled churros', 'filled churro', 'churros rellenos', 'churro relleno', 'cajeta', 'churros de cajeta', 'nutella churros'],
  },
  // ---- tamales & breakfast
  { slug: 'tamales', en: 'Tamales', es: 'Tamales', category: 'tamales', synonyms: ['tamal', 'tamales', 'tamale', 'tamales de puerco', 'tamales de pollo', 'tamales de rajas'] },
  {
    slug: 'champurrado',
    en: 'Champurrado & atole',
    es: 'Champurrado y atole',
    category: 'tamales',
    synonyms: ['champurrado', 'atole', 'atole de arroz', 'hot chocolate', 'chocolate caliente', 'cafe de olla'],
  },
  { slug: 'oaxacan-tamales', en: 'Oaxacan tamales', es: 'Tamales oaxaqueños', category: 'tamales', synonyms: ['tamales oaxaquenos', 'oaxacan tamales', 'tamales de mole', 'tamal de mole', 'tamal oaxaqueno'] },
  { slug: 'breakfast', en: 'Breakfast', es: 'Desayuno', synonyms: ['breakfast', 'desayuno', 'morning', 'manana', 'almuerzo'] },
  // ---- pupusas
  {
    slug: 'pupusas',
    en: 'Pupusas',
    es: 'Pupusas',
    category: 'pupusas',
    synonyms: ['pupusa', 'pupusas', 'salvadoran', 'salvadorian', 'salvadoreno', 'salvadorena', 'curtido', 'revuelta', 'pupuseria'],
  },
  // ---- paletas & drinks
  {
    slug: 'paletas',
    en: 'Paletas & ice cream',
    es: 'Paletas y helado',
    category: 'paletas',
    synonyms: ['paleta', 'paletas', 'ice pop', 'popsicle', 'popsicles', 'ice cream', 'helado', 'helados', 'nieve', 'paletero'],
  },
  { slug: 'raspados', en: 'Raspados (shaved ice)', es: 'Raspados', category: 'paletas', synonyms: ['raspado', 'raspados', 'shaved ice', 'snow cone', 'raspa', 'raspas'] },
  {
    slug: 'aguas-frescas',
    en: 'Aguas frescas',
    es: 'Aguas frescas',
    category: 'drinks',
    synonyms: ['agua fresca', 'aguas frescas', 'horchata', 'jamaica', 'tamarindo', 'pina', 'fresh juice', 'jugo'],
  },
  // ---- snacks & sweets
  {
    slug: 'korean-street-food',
    en: 'Korean street food',
    es: 'Comida callejera coreana',
    category: 'snacks',
    synonyms: ['korean', 'coreano', 'korean street food', 'hotteok', 'tteokbokki', 'korean corn dog', 'corn dog', 'kimbap'],
  },
  {
    slug: 'antojitos',
    en: 'Antojitos & snacks',
    es: 'Antojitos',
    category: 'snacks',
    synonyms: ['antojitos', 'snacks', 'botanas', 'chicharrones', 'duros', 'chips preparados', 'tostilocos', 'papitas'],
  },
  { slug: 'pan-dulce', en: 'Pan dulce', es: 'Pan dulce', category: 'bakery', synonyms: ['pan dulce', 'conchas', 'concha', 'pan', 'bakery', 'panaderia', 'pastries'] },
  { slug: 'late-night', en: 'Late night', es: 'Abierto tarde', synonyms: ['late night', 'late night food', 'open late', 'noche', 'de noche', 'abierto tarde', 'after hours'] },
];
