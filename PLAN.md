# HEVY Clone — Plan de Desarrollo

## 1. Investigación

### HEVY App — Resumen

**Qué es:** HEVY es un tracker de workouts para gimnasio centrado en logging de ejercicios, seguimiento de progreso y comunidad. Tiene +8M de usuarios, construido por Hevy Studios S.L.

**3 Pilares:**
1. Workout Logging — registro de series, repeticiones, pesos
2. Progress Tracking — gráficos, récords personales, estadísticas
3. Social — feed, seguir atletas, comparar rendimientos

**Precio:**
- Gratis: muy generoso, ilimitado para workouts/rutinas
- Pro: $8.99/mes o $59.99/año — analytics avanzados, creación de ejercicios, CSV export, más

---

## 2. Análisis de HEVY — Features

### Workout Logging
- [x] Registrar series con peso, reps, RPE
- [x] Marcar series como: Warmup, Normal, Drop set, Failure, Supersets
- [x] Base de datos de 400+ ejercicios predefinidos (nombre, músculo, equipo)
- [x] Buscar y filtrar ejercicios por músculo, nombre, equipo
- [x] Temporizador de descanso automático por ejercicio
- [x] Superset configurado por usuario
- [x] Calculadora de platos (standard/Olympic)
- [x] Ver pesos anteriores de cada ejercicio al hacer logging
- [x] Quick-add: añadir ejercicio sin buscar
- [x] Reordenar ejercicios en un workout arrastrando

### Rutinas y Planificación
- [x] Crear rutinas personalizadas con ejercicios ordenados
- [x] Asignar series/reps/peso objetivo a cada ejercicio
- [x] Duración estimada del workout
- [x] Empezar workout desde rutina (popula ejercicios)
- [x] Duplicar y editar rutinas existentes
- [x] Templates de rutinas pre-hechas
- [x] Marcar ejercicios como "favoritos"

### Progreso y Estadísticas
- [x] Récords personales (PR) por ejercicio — peso máximo, mejor volumen
- [x] Gráficos de volumen por músculo y por tiempo
- [x] Número de workouts por semana/mes
- [x] Historial completo de workouts
- [x] Tendencia de peso por ejercicio (gráfico)
- [x] Heatmap de actividad mensual (GitHub-style)
- [x] Estadísticas por grupo muscular (% del total)
- [x] Duración media de workouts

### Social (para versión futura)
- [ ] Feed de workouts públicos de otros atletas
- [ ] Seguir/dejar de seguir atletas
- [ ] "Likes" en workouts
- [ ] Comparar rendimiento con otros atletas
- [ ] Descubrir nuevos ejercicios y rutinas de la comunidad

---

## 3. Tech Stack (Web, 100% Local)

```
Framework:      React 18 + Vite 5 + TypeScript
Styling:        Tailwind CSS 3 (responsive, dark mode)
Database:       sql.js (SQLite compilado a WebAssembly, 100% browser)
State:          Zustand (lightweight, persistencia en localStorage)
Routing:        React Router v6
Charts:         Recharts (Sankey, bar, line)
Icons:          Lucide React
Date handling:  date-fns
Drag & Drop:    @dnd-kit/core
```

**Por qué esta elección:**
- Vite: build rápido, HMR instantáneo
- sql.js: SQLite real en el navegador, misma sintaxis que backend
- Zustand: simple, persistencia automática en localStorage
- Tailwind: responsive rápido, dark mode nativo
- Recharts: charts interactivos y responsive

---

## 4. Arquitectura de Datos (SQLite)

```sql
-- Ejercicios predefinidos + custom del usuario
CREATE TABLE exercises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  muscle_group TEXT,
  secondary_muscles TEXT,
  equipment TEXT,
  is_custom INTEGER DEFAULT 0,
  is_favorite INTEGER DEFAULT 0,
  created_at TEXT
);

-- Rutinas creadas por el usuario
CREATE TABLE routines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  estimated_duration_minutes INTEGER,
  created_at TEXT,
  updated_at TEXT
);

-- Ejercicios dentro de una rutina
CREATE TABLE routine_exercises (
  id TEXT PRIMARY KEY,
  routine_id TEXT REFERENCES routines(id),
  exercise_id TEXT REFERENCES exercises(id),
  order_index INTEGER,
  target_sets INTEGER,
  target_reps TEXT,
  target_weight REAL,
  rest_seconds INTEGER DEFAULT 90
);

-- Workouts completados
CREATE TABLE workouts (
  id TEXT PRIMARY KEY,
  routine_id TEXT REFERENCES routines(id),
  name TEXT,
  started_at TEXT,
  finished_at TEXT,
  duration_seconds INTEGER,
  notes TEXT,
  is_public INTEGER DEFAULT 0
);

-- Series dentro de un workout
CREATE TABLE workout_sets (
  id TEXT PRIMARY KEY,
  workout_id TEXT REFERENCES workouts(id),
  exercise_id TEXT REFERENCES exercises(id),
  set_number INTEGER,
  set_type TEXT,
  reps INTEGER,
  weight REAL,
  rpe REAL,
  completed_at TEXT
);

-- Récords personales
CREATE TABLE personal_records (
  id TEXT PRIMARY KEY,
  exercise_id TEXT REFERENCES exercises(id),
  type TEXT,
  value REAL,
  achieved_at TEXT,
  workout_id TEXT REFERENCES workouts(id)
);
```

---

## 5. Pantallas

### Nav: Home / Workout
- Si no hay workout activo: mensaje de bienvenida + botón "Empezar Workout"
- Si hay workout activo: ejercicios del workout, series completadas, timer
- Botón: "+" para añadir ejercicio al workout actual

### Nav: Ejercicios
- Lista completa con search bar y filtros
- Filtros: por músculo (pecho, espalda, piernas, hombros, brazos, core), equipo
- Cada card: nombre ejercicio, músculo principal, PR actual
- Tap → detalle del ejercicio (historial, PRs, añadir a rutina)

### Nav: Rutinas
- Lista de rutinas del usuario
- Card: nombre, nº ejercicios, duración estimada
- Tap → editar rutina
- Botón "+" para crear nueva rutina

### Nav: Progreso
- Resumen semanal (workouts, volumen total, duración)
- Heatmap anual de workouts
- Top ejercicios por volumen
- Lista de PRs recientes
- Gráficos: volumen semanal, peso por ejercicio

### Nav: Perfil
- Stats generales: workouts totales, streak actual, volumen total
- Lista de workouts completados
- Exportar datos (JSON)
- Settings: unidades (kg), rest timer default

---

## 6. Fases de Implementación

### Fase 1: Fundamentos
- [ ] Inicializar Vite + React + TypeScript
- [ ] Configurar Tailwind CSS (dark mode)
- [ ] Integrar sql.js con schema completo
- [ ] Poblar 400+ ejercicios (CSV seed)
- [ ] Zustand stores con persistencia
- [ ] React Router con layout responsive
- [ ] Theme: dark, colores HEVY-like

### Fase 2: Core Workout Logging
- [ ] Pantalla Home — empezar/parar workout
- [ ] Añadir ejercicios a workout activo
- [ ] Registrar sets con peso/reps/RPE
- [ ] Timer de descanso
- [ ] Marcar tipos de serie
- [ ] Ver pesos anteriores

### Fase 3: Ejercicios y Rutinas
- [ ] Pantalla Ejercicios — lista, search, filtros
- [ ] Pantalla detalle ejercicio
- [ ] Crear/editar rutinas
- [ ] Empezar workout desde rutina

### Fase 4: Progreso y Estadísticas
- [ ] Dashboard de progreso
- [ ] Heatmap anual
- [ ] Gráficos con Recharts
- [ ] Récords personales
- [ ] Historial de workouts

### Fase 5: Polish
- [ ] Calculadora de platos
- [ ] Calculadora de 1RM
- [ ] Animaciones
- [ ] Onboarding
- [ ] Exportar JSON

---

## 7. Estructura del Proyecto

```
hevy-app/
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── package.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── components/
│   │   ├── layout/          # Header, BottomNav, Layout
│   │   ├── workout/          # SetRow, ExerciseCard, RestTimer
│   │   ├── exercises/        # ExerciseList, ExerciseSearch
│   │   ├── routines/         # RoutineCard, RoutineForm
│   │   ├── progress/         # Heatmap, StatCard, Charts
│   │   └── ui/               # Button, Card, Input, Modal
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Exercises.tsx
│   │   ├── ExerciseDetail.tsx
│   │   ├── Routines.tsx
│   │   ├── RoutineDetail.tsx
│   │   ├── Progress.tsx
│   │   └── Profile.tsx
│   ├── database/
│   │   ├── init.ts           # sql.js init + schema
│   │   ├── seed.ts           # Populate exercises
│   │   └── queries.ts        # All SQL queries
│   ├── store/
│   │   ├── workoutStore.ts
│   │   ├── exerciseStore.ts
│   │   └── settingsStore.ts
│   ├── data/
│   │   └── exercises_seed.ts  # 400+ exercises
│   ├── theme/
│   │   └── index.ts
│   └── utils/
│       ├── calculations.ts
│       └── formatters.ts
└── PLAN.md
```

---

## 8. Diseño

### Colores (Dark Theme estilo HEVY)
```
Background:    #0A0A0A (casi negro)
Surface:       #141414 (cards)
Surface-2:     #1E1E1E (inputs)
Border:        #2A2A2A
Primary:       #FFB300 (amarillo/dorado — acento HEVY)
Primary-hover: #FFA000
Text:          #FFFFFF
Text-2:        #A0A0A0
Success:       #4CAF50
Danger:        #F44336
```

### Tipografía
```
Font: Inter (Google Fonts)
Headings: 700, sizes 24-32px
Body: 400, 14-16px
Numbers (peso/reps): 700, 24-48px, monospace-style
```

### Layout Responsive
```
Mobile:  < 640px  — 1 columna, bottom nav
Tablet:  640-1024px — 2 columnas donde aplique
Desktop: > 1024px — max-width 1200px centrado, sidebar nav opcional
```
