# Prompt para Gemini — Presentación de Publi-Potage

> Copiá y pegá todo el bloque de abajo en Gemini (con la app abierta). Adjuntá las capturas que quieras incluir (login, dashboard, sucursales, grupos, calendario mes/móvil/agenda, informes, logs, modo claro y oscuro, móvil y desktop) antes de enviarlo.

---

## PROMPT

Actuá como un **diseñador senior de presentaciones** (Canva / PowerPoint / Google Slides) especializado en portfolios de producto y demos técnicas. Necesito que generes una presentación **profesional, moderna y visualmente atractiva** que explique qué es, cómo funciona y cómo se ve la aplicación web **Publi-Potage**.

### Contexto del producto
- **Nombre:** Publi-Potage — Sistema de gestión interna para sucursales, grupos, calendario, informes, logs, permisos y cuentas.
- **Stack:** Node.js + Express + PostgreSQL; frontend en HTML/CSS/JS vanilla con **Bootstrap 5.3.3**, **bootstrap-icons 1.11.3** y **Chart.js**.
- **PWA:** Service Worker propio (caché estático versionado, actualmente `potage-v42`).
- **Auth:** JWT de acceso + refresh token (renovación automática en background), roles y permisos granulares.
- **Temas:** modo claro y oscuro, responsive completo (320–1440px+), áreas seguras y bottom-sheets en móvil.
- **Demo en vivo:** https://publi-potage.onrender.com/

### Objetivo
Producir una presentación lista para mostrar a stakeholders/equipo que combine **storytelling de producto**, **capturas reales** y **detalle técnico claro**, sin tecnicismos innecesarios.

### Estilo visual
- Paleta coherente con Potage: azules/teal como primario, neutros grises, verde para estados positivos; versión oscura elegante (fondo casi negro con superficies elevadas).
- Tipografía sans clara (títulos grandes, cuerpo legible). Espaciado generoso, sin saturación.
- Estética “app moderna”: mockups de tarjetas, teléfonos y navegador con sombras suaves.
- Iconografía minimalista coherente (bootstrap-icons o similar).
- Cada slide con **título corto**, **1 idea principal** y **máximo 5 bullets**.
- Incluí **notas del expositor** en cada diapositiva.

### Estructura (mínimo, podés ampliar)
1. **Portada** — Título, subtítulo, autor/fecha, mockup de fondo.
2. **Índice / Agenda.**
3. **El problema** y la propuesta de valor.
4. **Arquitectura técnica** — diagrama simple (frontend / API / PostgreSQL), PWA, auth.
5. **Recorrido por la app:**
   - Login / Registro
   - Dashboard con KPIs y gráficos
   - Sucursales
   - Grupos
   - **Calendario** (Mes, Semana, Día, Agenda; recurrencias; marcar “Realizada” con autoría solo admin; drag & deshacer)
   - Informes
   - Logs / auditoría
   - Permisos por rol
   - Configuración de cuenta
6. **Autenticación y permisos** — roles, permisos granulares, refresh de token sin re-login.
7. **Diseño UI/UX** — modo claro/oscuro, responsive, accesibilidad (foco visible, aria), safe areas, interacción táctil 44px.
8. **Enfoque móvil** — cabecera compacta, filtros en panel inferior, mes liviano 44–52px, agenda del día protagonista, bottom-sheets.
9. **PWA y rendimiento.**
10. **Seguridad** — JWT + refresh, strip de auditoría por rol, validaciones backend.
11. **Mejoras recientes** — refresh tokens + `authFetch`, UI móvil del calendario, correcciones de modo oscuro y responsive.
12. **Resultados / próximos pasos.**
13. **Cierre + demo en vivo** (link y QR si es posible).
14. **Preguntas.**

### Formato de entrega
- Generá el contenido **slide por slide** (título + bullets + notas del expositor) para que pueda pegarlo directo.
- Al final, dá **instrucciones de diseño en Canva** (plantillas, tamaños 16:9, paleta hex, fuentes) o un **script de exportación a PPTX**.
- Si falta alguna captura, indicame exactamente **qué pantalla/foco y qué resolución** (móvil 390×844, desktop 1440×900) y dónde ubicarla.

### Restricciones
- Español neutro (Argentina).
- No inventes funcionalidades que no existan (solo las listadas arriba).
- Priorizá claridad y jerarquía visual por encima de la cantidad de texto.
