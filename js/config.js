// ============================================================
// CONFIGURACIÓN
// Todo lo de este archivo es público (lo ve cualquiera que abra la web).
// El acceso de admin se maneja con usuarios de Supabase (ver supabase/seguridad.sql).
// ============================================================

// Número de WhatsApp (sin +, con código de país)
const WA_NUMBER = '5491133111207';

// Mínimo para envío gratis (en pesos)
const FREE_SHIPPING_MIN = 150000;

// Supabase — la clave "anon" es pública a propósito: lo que cada uno puede ver lo deciden los permisos (RLS) de la base
const SUPABASE_URL  = 'https://sinmjypgphftnewshvnh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpbm1qeXBncGhmdG5ld3Nodm5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMjc5NzEsImV4cCI6MjA5NTcwMzk3MX0.3AJCTfTCOWkjodQo0fRn_-7KiRLnDftcy9pq0OA5q84';
