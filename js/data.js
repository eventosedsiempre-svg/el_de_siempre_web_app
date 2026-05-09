// ============================================================
// PRODUCTOS — editá precio, nombre, imagen acá directamente
// img: ruta a la foto en images/productos/ — dejá '' si no hay foto
// ============================================================
const PRODUCTOS = [
  // PROMOCIONES
  { id: 1,  name: 'Muzzarella x5',                price: 44775, cat: 'PROMOCIONES', emoji: '🔥', badge: 'promo',   img: 'images/productos/pizza-muzzarella.jpg' },
  { id: 2,  name: 'Muzzarella x10',               price: 84575, cat: 'PROMOCIONES', emoji: '🔥', badge: 'promo',   img: 'images/productos/pizza-muzzarella.jpg' },
  { id: 3,  name: '10 pizzas a elección',          price: 99900, cat: 'PROMOCIONES', emoji: '🔥', badge: 'promo',   img: 'images/productos/pizza-muzzarella.jpg' },
  // PIZZAS
  { id: 4,  name: 'Pizza Muzzarella',              price: 9950,  cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: 'images/productos/pizza-muzzarella.jpg' },
  { id: 5,  name: 'Pizza Jamón cocido',            price: 10395, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: '' },
  { id: 6,  name: 'Pizza Fugazzeta',               price: 10395, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: '' },
  { id: 7,  name: 'Pizza Cebolla caramelizada',    price: 10395, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: '' },
  { id: 8,  name: 'Pizza Provolone',               price: 11320, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: '' },
  { id: 9,  name: 'Pizza Jamón y morrón',          price: 11320, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: '' },
  { id: 10, name: 'Pizza 4 quesos',                price: 11320, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: '' },
  { id: 11, name: 'Pizza Cebolla y queso brie',    price: 11320, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: '' },
  { id: 12, name: 'Pizza Cebolla y roquefort',     price: 11320, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: '' },
  { id: 13, name: 'Pizza Champignon y parmesano',  price: 11320, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: '' },
  // EMPANADAS
  { id: 14, name: 'Empanadas Jamón y queso',       price: 15180, cat: 'EMPANADAS',   emoji: '🥟', badge: '',        img: '' },
  { id: 15, name: 'Empanadas Cebolla y queso',     price: 15180, cat: 'EMPANADAS',   emoji: '🥟', badge: '',        img: '' },
  { id: 16, name: 'Empanadas Bondiola braseada',   price: 15180, cat: 'EMPANADAS',   emoji: '🥟', badge: '',        img: 'images/productos/empanada-de-bondiola.jpg' },
  { id: 17, name: 'Empanadas Pollo al verdeo',     price: 15180, cat: 'EMPANADAS',   emoji: '🥟', badge: '',        img: '' },
  { id: 18, name: 'Empanadas Espinaca y parmesano',price: 15180, cat: 'EMPANADAS',   emoji: '🥟', badge: '',        img: '' },
  { id: 19, name: 'Empanadas Carne a cuchillo',    price: 15180, cat: 'EMPANADAS',   emoji: '🥟', badge: '',        img: '' },
  { id: 20, name: 'Empanadas Capresse',            price: 15180, cat: 'EMPANADAS',   emoji: '🥟', badge: '',        img: '' },
  { id: 21, name: 'Empanadas Mix de hongos',       price: 15180, cat: 'EMPANADAS',   emoji: '🥟', badge: '',        img: '' },
  // TARTAS
  { id: 22, name: 'Tarta Jamón y queso',           price: 11385, cat: 'TARTAS',      emoji: '🥧', badge: '',        img: '' },
  { id: 23, name: 'Tarta Tres cebollas',           price: 11385, cat: 'TARTAS',      emoji: '🥧', badge: '',        img: '' },
  { id: 24, name: 'Tarta Zapallo',                 price: 11385, cat: 'TARTAS',      emoji: '🥧', badge: '',        img: 'images/productos/tarta-de-zapallo.jpg' },
  { id: 25, name: 'Tarta Pollo puerro y panceta',  price: 11385, cat: 'TARTAS',      emoji: '🥧', badge: '',        img: '' },
  { id: 26, name: 'Tarta Vegetales asados',        price: 11385, cat: 'TARTAS',      emoji: '🥧', badge: '',        img: '' },
  // SIN TACC
  { id: 27, name: 'Pizza Muzzarella SIN TACC',     price: 11320, cat: 'SIN TACC',    emoji: '🌾', badge: 'sintacc', img: 'images/productos/pizza-muzzarella.jpg' },
  // MILANESAS
  { id: 28, name: 'Milanesas de Peceto 500g',      price: 16951, cat: 'MILANESAS',   emoji: '🥩', badge: '',        img: '' },
  { id: 29, name: 'Milanesas de Pollo 1kg',        price: 18975, cat: 'MILANESAS',   emoji: '🥩', badge: '',        img: '' },
];

// ============================================================
// ZONAS DE ENTREGA — actualizá los nombres y costos según tus zonas reales
// pickup: true = retiro en el local (gratis)
// ============================================================
const ZONAS = {
  'retiro':       { name: 'Retiro en Rincón de Milberg', cost: 0,    pickup: true  },
  'nordelta':     { name: 'Nordelta',                    cost: 3500, pickup: false },
  'tigre':        { name: 'Tigre',                       cost: 3500, pickup: false },
  'san-fernando': { name: 'San Fernando',                cost: 3500, pickup: false },
  'san-isidro':   { name: 'San Isidro',                  cost: 4000, pickup: false },
  'martinez':     { name: 'Martínez',                    cost: 4000, pickup: false },
  'escobar':      { name: 'Escobar',                     cost: 4500, pickup: false },
  'pilar':        { name: 'Pilar',                       cost: 5000, pickup: false },
};

// ============================================================
// CUPONES DE DESCUENTO — { 'CODIGO': porcentaje (0.10 = 10%) }
// ============================================================
const CUPONES = {
  // 'PROMO10': 0.10,
};
