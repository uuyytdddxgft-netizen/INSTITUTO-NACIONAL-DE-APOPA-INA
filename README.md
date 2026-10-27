# Note INA

Prototipo móvil para registrar problemas del Instituto Nacional de Apopa.

## Probar la aplicación

La interfaz de estudiante y la pantalla del panel docente están reunidas en `index.html`: contiene el HTML, los estilos, los iconos y el JavaScript. Ábrelo o sírvelo desde VS Code con una extensión como Live Server. Para que el almacenamiento local funcione de forma fiable, se recomienda `localhost` o HTTPS. Para compartir un QR que funcione en otros teléfonos, publica este archivo en un sitio HTTPS público: cuando se abre desde `file://` o localhost, la app explica por qué todavía no puede ofrecer un QR compartible.

En una dirección HTTPS pública, el QR de acceso se genera con QR Server usando solo la dirección pública de la app, sin parámetros ni fragmentos de sesión. Se requiere conexión a internet para descargar la imagen del QR; el enlace también se puede copiar desde la página.

La aplicación ahora incluye el cliente REST de Supabase, autenticación, carga de fotos y el panel docente. El archivo SQL define una instalación inicial; las migraciones v2 y v3 actualizan un esquema existente sin eliminar reportes. El modo instalable/PWA usa un manifiesto y un service worker separados.

### Publicar para probar desde teléfonos

El flujo de GitHub Pages está en `.github/workflows/pages.yml`. Al subir el proyecto a la rama `main`, habilita GitHub Pages en **Settings → Pages → Build and deployment → GitHub Actions**. Cuando termine la acción **Deploy Note INA**, comparte la URL `https://<usuario>.github.io/<repositorio>/`; abre el enlace desde el teléfono o escanea el QR que genera la aplicación. La primera publicación requiere que el repositorio tenga la opción Pages habilitada.

## Alcance actual

- Antes de la pantalla de carga, la aplicación pregunta si se usará como estudiante o como adulto responsable. El formulario del estudiante acepta el código de verificación de un solo uso del INA, incluidos códigos cortos como `1F 02`, sin pedir el NIE; el formulario adulto no muestra ese código y solicita nombre completo, DUI y teléfono. En el modo conectado, el correo autorizado del adulto se solicita aparte para recibir el enlace seguro de acceso.
- El nombre, DUI y teléfono del adulto no se usan como credenciales, no se guardan en Supabase y se borran del formulario al solicitar el enlace o continuar en modo demostración. El correo se usa para iniciar sesión, pero el INA debe invitar previamente esa cuenta y vincularla al estudiante; escribir los datos del adulto no crea ni autoriza esa relación.
- En modo Supabase, el estudiante inicia una sesión anónima protegida por Supabase Auth usando un código de acceso de un solo uso, sin iniciar sesión con correo ni proporcionar NIE. La sesión anónima no verifica la identidad del estudiante.
- Solo una cuenta docente o administrativa previamente creada y autorizada puede consultar el historial institucional completo, incluidos reportes enviados por adultos responsables vinculados. Los enlaces mágicos no crean usuarios nuevos; el rol y la membresía institucional se verifican en el servidor y las búsquedas se registran para auditoría.
- La pantalla de inicio muestra una animación de carga con frases sobre convivencia escolar después de seleccionar el perfil.
- El tema claro u oscuro se puede cambiar desde el acceso y los encabezados de estudiante y docente; la preferencia se guarda en el dispositivo y, si no se ha elegido una, sigue el tema del sistema.
- En demostración, los reportes se guardan en IndexedDB; con Supabase configurado, se guardan localmente y se sincronizan con la nube incluyendo fecha, hora y fotos. La base guarda reportes y permisos, no los nombres, NIE, DUI ni teléfonos de los formularios; los reportes se asocian a un ID de sesión.
- Al cerrar sesión se borran los datos temporales del estudiante y el identificador local de sesión. Los reportes ya guardados no se borran del dispositivo ni de Supabase.
- La sección «Ver reportes» muestra únicamente los reportes de la fecha actual, usando la fecha local del dispositivo. Al cambiar el día, la lista diaria se reinicia automáticamente mientras la aplicación está abierta o al volver a ella.
- Los reportes de días anteriores se conservan con sus fechas originales. Con Supabase conectado, el historial lo pueden consultar docentes autorizados desde otros dispositivos mediante el panel privado `teacher.html`.
- El almacenamiento local reduce la identificación directa, pero no garantiza anonimato ni protege frente a alguien con acceso al navegador. En Supabase, las fotos quedan en un bucket privado, con acceso temporal firmado y controlado por políticas.
- El acceso docente usa enlaces mágicos a cuentas que el INA debe crear y autorizar previamente; solo el servidor asigna roles y relaciones docente-estudiante. No se guarda ninguna clave secreta en el frontend. La clave publicable/anon de Supabase es la única que se configura en el cliente y RLS debe permanecer habilitado.
- Se pueden adjuntar hasta 3 fotos por reporte; se comprimen en el navegador. «Elegir fotos» abre la galería o selector del teléfono; «Abrir cámara» solicita permiso al navegador del teléfono solo cuando se toca. El teléfono puede mostrar su diálogo de permiso según el navegador y su configuración. Para usar la cámara, el sitio debe abrirse en un contexto seguro (HTTPS o `localhost`) y el permiso de cámara debe estar habilitado. Las fotos capturadas se añaden solo después de tocar «Tomar foto» y se guardan localmente; cerrar la cámara detiene su uso. La vista previa y el almacenamiento no envían fotos a ningún servidor.
- Las categorías incluyen situaciones de convivencia y seguridad, como burlas, acoso escolar o cibernético, peleas, amenazas, discriminación y accidentes. Para algunas situaciones se muestra una recomendación inmediata. También se puede marcar que alguien está herido o en peligro; esa marca destaca el reporte local y se incluye en el mensaje para compartir, pero no avisa automáticamente al personal.
- Si alguien está en peligro o herido, avisa de inmediato en persona a un docente o adulto de confianza; no esperes respuesta de la aplicación.
- El borrador automático combina categoría, lugar, prioridad y observación escrita. Es una plantilla local, no inteligencia artificial ni un servicio de análisis de imágenes.
- Cada reporte ofrece enlaces de WhatsApp de prueba a los dos números de docentes compartidos por el solicitante. WhatsApp abre un mensaje con el texto; la persona debe revisar y pulsar Enviar. No existe transmisión automática ni confirmación de entrega. Los números son destinos de prueba y deben autorizarse antes de publicar.
- Para adjuntar fotos, usa «Compartir reporte y fotos» en un dispositivo/navegador que admita compartir archivos y elige WhatsApp y el chat. Si no aparece la opción, abre el chat del docente y adjunta las fotos manualmente. El sitio no puede seleccionar el contacto y mandar texto e imagen a escondidas.
- Supabase almacena los reportes y las fotos cuando está configurado. No se envían notificaciones automáticas a coordinación, subdirección ni dirección.
- El flujo propuesto es Recibido → En revisión → En atención → Resuelto. En esta demostración los reportes se muestran como Recibido; no se pueden marcar como atendidos desde el dispositivo del estudiante.
- Los niveles bajo, medio, crítico y peligro son seleccionados por quien reporta. Si hay un riesgo inmediato, se debe avisar directamente a un docente o a las autoridades.
- Evita adjuntar fotos de personas sin su permiso. Los reportes pueden borrarse al limpiar los datos del navegador.

## Configuración manual de Supabase

El esquema y `supabase-migration-v2.sql` se aplicaron manualmente en el proyecto Supabase. Para actualizar la consulta docente existente y permitir que las cuentas docentes autorizadas consulten todos los reportes de la institución, aplica también `supabase-migration-v3.sql`. Si ya aplicaste v2, ejecuta además `supabase-migration-v4.sql` para que el servidor acepte códigos cortos como `1F 02` además de los códigos largos existentes. `cloud-config.js` ya contiene la URL del proyecto, la clave publishable y el UUID de la institución. El acceso anónimo se habilitó en Authentication y se verificó después de volver a cargar el panel. Para completar la puesta en marcha:

1. En Supabase, revisa si ya existen las tablas del esquema (`profiles`, `institutions`, `institution_members`, `teacher_student_access`, `reports` y `report_audit_log`). Si el esquema aún no se instaló, ejecuta `supabase-schema.sql` una sola vez. Si ya existe, **no vuelvas a ejecutar el esquema base**: aplica las migraciones v2, v3 y v4 en orden desde el SQL Editor. Las migraciones actualizan funciones sin borrar reportes. Si la v2 detecta políticas adicionales en `reports` o en `storage.objects` que podrían ampliar el acceso, cancela toda la transacción para que las revises antes de continuar; no las borres a ciegas.
2. Verifica que `ina-report-photos` sea un bucket privado. La migración lo crea si falta, pero se detiene si encuentra un bucket existente con ajustes inseguros en vez de sobrescribirlos. No configures reglas de borrado automático para ese bucket o las tablas si necesitas conservar el historial.
3. En Authentication, mantén activados **Allow new users to sign up** y **Allow anonymous sign-ins**: Supabase usa el endpoint de alta para crear sesiones anónimas y desactivar el primer ajuste bloquea el acceso estudiantil. El cliente solicita enlaces adultos/docentes con `create_user:false`, y el trigger del servidor restringe las cuentas de correo no invitadas; no habilites registro de cuentas desde la aplicación. Configura CAPTCHA/rate limits para reducir abuso de sesiones anónimas, SMTP y las URL de redirección HTTPS para la aplicación y `teacher.html`.
4. Crea la institución una sola vez y copia su UUID:

   ```sql
   select id, name from public.institutions;
   ```

   Si no aparece, crea una fila desde el SQL Editor y vuelve a consultar. No insertes otra institución si ya existe.
5. `cloud-config.js` ya tiene configurados el Project URL, la clave **publishable** y el UUID de esta institución. Si conectas otro proyecto, reemplaza esos tres valores. Nunca pegues la `service_role` key en ese archivo ni en el navegador.
6. Invita las cuentas de docentes en Authentication. Después, con sus UUID reales, un administrador debe asignar `profiles.role = 'teacher'` y añadirlas a `institution_members`; con la migración v3, la membresía institucional y el rol autorizado permiten consultar todos los reportes de la institución. Para adultos vinculados, la administración también debe invitarlos previamente (pueden usar un correo personal), asignar `profiles.role = 'adult'`, añadir su membresía y agregar sus relaciones en `adult_student_access`. La migración permite correos fuera del dominio institucional únicamente para usuarios invitados; el acceso público no queda autorizado por la invitación por sí sola. Ningún UUID se deduce del NIE/DUI; esos datos no sustituyen la autorización administrativa.
7. El INA debe emitir códigos de acceso aleatorios de un solo uso para estudiantes. Guárdalos como hash en `student_access_codes`; la app nunca recibe la tabla ni almacena el código tras canjearlo. Un ejemplo para generar **un código** (cambia el UUID de institución por el real) y mostrarlo una sola vez al administrador:

   ```sql
   with generated as (
     select encode(extensions.gen_random_bytes(24), 'hex') as code
   ),
   inserted as (
     insert into public.student_access_codes (institution_id, code_hash, expires_at)
     select
       'UUID-DE-LA-INSTITUCION'::uuid,
       encode(extensions.digest(convert_to(code, 'UTF8'), 'sha256'), 'hex'),
       now() + interval '30 days'
     from generated
     returning code_hash
   )
   select upper(generated.code) as codigo_de_un_solo_uso
   from generated
   join inserted on inserted.code_hash =
     encode(extensions.digest(convert_to(generated.code, 'UTF8'), 'sha256'), 'hex');
   ```

   Entrega el valor devuelto fuera de la aplicación a un alumno autorizado. Se canjea una sola vez y queda vinculado al identificador anónimo de esa sesión. No reutilices códigos compartidos ni los incluyas en capturas o registros.
8. Publica el sitio por HTTPS y deja el service worker instalar la nueva versión. El modo Supabase no funciona abriendo `index.html` con `file://`.

Los estudiantes necesitan un código de acceso válido del INA para asociar su sesión anónima a la institución. Sin ese código, Supabase no autoriza guardar reportes. No se transmite su NIE. Los adultos solo pueden cargar reportes para los estudiantes que el INA vinculó a su UUID. Las búsquedas docentes y fotos se validan en funciones/RLS del servidor; no existe acceso público de lectura ni borrado desde el cliente.

## Comprobación

- Con la URL, clave publicable y UUID configurados, abre `index.html` en HTTPS y crea un reporte estudiantil. Verifica la fila en `public.reports` y que las fotos estén en el bucket privado.
- Desde otro dispositivo, inicia sesión en `teacher.html` con una cuenta docente previamente invitada y autorizada como miembro de la institución. Comprueba que puede ver reportes de estudiantes y adultos responsables, filtrar el historial, cambiar el estado y abrir las fotos mediante el enlace temporal.
- Prueba con un estudiante no asignado, una cuenta no autorizada y una sesión anónima intentando consultar el panel; todas deben recibir acceso denegado.
- Cierra sesión, vuelve a iniciar y revisa que los reportes y fotos sigan en Supabase.

La persistencia remota queda sujeta al estado del proyecto y a sus políticas de respaldo/retención; configura y prueba backups de Supabase antes de usarlo con reportes reales. Los incidentes peligrosos aún requieren avisar directamente a un adulto: la app no envía alertas automáticas. La IA real y las notificaciones institucionales requieren servicios adicionales.
