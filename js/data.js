// ============================================================
// PRODUCTOS — editá precio, nombre, imagen acá directamente
// img: ruta a la foto en images/productos/ — dejá '' si no hay foto
// activo: false → el producto no se muestra en ningún lado (catálogo, home,
//   buscador). Para volver a habilitarlo cambiá false por true o borrá activo.
// ============================================================
const PRODUCTOS = [
  // PROMOCIONES
  { id: 1,  name: 'Muzzarella x5',                price: 49500,  cat: 'PROMOCIONES', emoji: '🔥', badge: 'promo',   img: 'images/productos/MUZZA-X5-MUZZA-X10.jpg' },
  { id: 2,  name: 'Muzzarella x10',               price: 93500,  cat: 'PROMOCIONES', emoji: '🔥', badge: 'promo',   img: 'images/productos/MUZZA-X5-MUZZA-X10.jpg' },
  { id: 3,  name: '10 pizzas a elección',          price: 106250, cat: 'PROMOCIONES', emoji: '🔥', badge: 'promo',   img: 'images/productos/10-PIZZAS-A-ELECCION.jpg' },
  // PIZZAS
  { id: 4,  name: 'Pizza Muzzarella',              price: 11000, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: 'images/productos/MUZZARELLA.jpg' },
  { id: 5,  name: 'Pizza Jamón cocido',            price: 11500, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: 'images/productos/JAMON.jpg' },
  { id: 6,  name: 'Pizza Fugazzeta',               price: 11500, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: 'images/productos/CEBOLLA-CARAMELIZADA-Y-FUGAZZETA.jpg' },
  { id: 7,  name: 'Pizza Cebolla caramelizada',    price: 11500, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: 'images/productos/CEBOLLA-CARAMELIZADA-Y-FUGAZZETA.jpg' },
  { id: 8,  name: 'Pizza Provolone',               price: 12500, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: 'images/productos/PROVOLONE.jpg' },
  { id: 9,  name: 'Pizza Jamón y morrón',          price: 12500, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: 'images/productos/JAMON-Y-MORRON.jpg' },
  { id: 10, name: 'Pizza 4 quesos',                price: 12500, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: 'images/productos/4-QUESOS.jpg' },
  { id: 11, name: 'Pizza Cebolla y queso brie',    price: 12500, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: 'images/productos/BRIE-Y-CARAMELIZADA.jpg' },
  { id: 12, name: 'Pizza Cebolla y roquefort',     price: 12500, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: 'images/productos/ROQUEFORT-Y-CARAMELIZADA.jpg' },
  { id: 13, name: 'Pizza Champignon y parmesano',  price: 12500, cat: 'PIZZAS',      emoji: '🍕', badge: '',        img: 'images/productos/CHAMPI-Y-PARMESANO.jpg' },
  // EMPANADAS
  { id: 14, name: 'Empanadas Jamón y queso',       price: 15180, cat: 'EMPANADAS',   emoji: '🥟', badge: '',        img: 'images/productos/EMPANADA-JAMON-Y-QUESO-Y-VERDURA.jpg' },
  { id: 15, name: 'Empanadas Cebolla y queso',     price: 15180, cat: 'EMPANADAS',   emoji: '🥟', badge: '',        img: 'images/productos/EMPANADA-CEBOLLA-Y-QUESO-HONGOS-CAPRESE.jpg' },
  { id: 16, name: 'Empanadas Bondiola braseada',   price: 15180, cat: 'EMPANADAS',   emoji: '🥟', badge: '',        img: 'images/productos/EMPANADA-BONDIOLA.jpg' },
  { id: 17, name: 'Empanadas Pollo al verdeo',     price: 15180, cat: 'EMPANADAS',   emoji: '🥟', badge: '',        img: 'images/productos/EMPANADA-POLLO_.jpg' },
  { id: 18, name: 'Empanadas Espinaca y parmesano',price: 15180, cat: 'EMPANADAS',   emoji: '🥟', badge: '',        img: 'images/productos/EMPANADA-JAMON-Y-QUESO-Y-VERDURA.jpg' },
  { id: 19, name: 'Empanadas Carne a cuchillo',    price: 15180, cat: 'EMPANADAS',   emoji: '🥟', badge: '',        img: 'images/productos/EMPANADA-CARNE.jpg' },
  { id: 20, name: 'Empanadas Capresse',            price: 15180, cat: 'EMPANADAS',   emoji: '🥟', badge: '',        img: 'images/productos/EMPANADA-CEBOLLA-Y-QUESO-HONGOS-CAPRESE.jpg' },
  { id: 21, name: 'Empanadas Mix de hongos',       price: 15180, cat: 'EMPANADAS',   emoji: '🥟', badge: '',        img: 'images/productos/EMPANADA-CEBOLLA-Y-QUESO-HONGOS-CAPRESE.jpg' },
  // TARTAS
  { id: 22, name: 'Tarta Jamón y queso',           price: 11385, cat: 'TARTAS',      emoji: '🥧', badge: '',        img: 'images/productos/TARTA-JAMON-Y-QUESO.jpg' },
  { id: 23, name: 'Tarta Tres cebollas',           price: 11385, cat: 'TARTAS',      emoji: '🥧', badge: '',        img: 'images/productos/TARTA-3-QUESOS-3-CEBOLLAS.jpg' },
  { id: 24, name: 'Tarta Zapallo',                 price: 11385, cat: 'TARTAS',      emoji: '🥧', badge: '',        img: 'images/productos/TARTA-ZAPALLO.jpg' },
  { id: 25, name: 'Tarta Pollo puerro y panceta',  price: 11385, cat: 'TARTAS',      emoji: '🥧', badge: '',        img: 'images/productos/TARTA-POLLO-PUERRO-PANCETA.jpg' },
  { id: 26, name: 'Tarta Vegetales asados',        price: 11385, cat: 'TARTAS',      emoji: '🥧', badge: '',        img: 'images/productos/TARTA-VEGETALES.jpg' },
  // SIN TACC
  { id: 27, name: 'Pizza Muzzarella SIN TACC',     price: 12000, cat: 'SIN TACC',    emoji: '🌾', badge: 'sintacc', img: 'images/productos/MUZZARELLA.jpg' },
  // MILANESAS
  { id: 28, name: 'Milanesas de Peceto 500g',      price: 17000, cat: 'MILANESAS',   emoji: '🥩', badge: '',        img: 'images/productos/MILANESA-CARNE.jpg', activo: false },
  { id: 29, name: 'Milanesas de Pollo 1kg',        price: 19000, cat: 'MILANESAS',   emoji: '🥩', badge: '',        img: 'images/productos/MILANESA-POLLO.jpg', activo: false },
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
  'EDS10': 0.10,
  'PEDRO10': 0.10,
};
