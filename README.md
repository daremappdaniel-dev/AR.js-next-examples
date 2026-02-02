# AR.js-next-examples 

Muy moderna última versión hace 3 meses, no permite usar Ar.frame. Requiere una capa de complejidad extra.

Info extraida del readme de ar.js-next

✨ Núcleo solo ECS
A partir de la versión 0.2.x, AR.js-next es exclusivo de ECS. Se han eliminado las clases heredadas (Source, Profile, Session, SessionDebugUI) para centrarse en:

Diseño modular con un sistema de complementos limpio
ECS orientado a datos para un procesamiento eficiente
Arquitectura basada en eventos con mensajería de publicación y suscripción
Base independiente del renderizador para AR.js-next
Las integraciones de renderizador residen en repositorios externos:

complemento arjs threejs
Si necesita la API heredada, utilice 0.1.x o migre a la arquitectura ECS a continuación.

**No tiene geolocalizacion se separo en locAR**

Info del repo de LocAR.

¿Por qué?
La RA basada en la ubicación forma parte de AR.js desde hace tiempo. Sin embargo, este componente es prácticamente independiente de los componentes basados ​​en marcadores y NFT. Por lo tanto, conviene separarlo en un proyecto propio para que, por ejemplo, sus dependencias (principalmente three.js) puedan actualizarse sin afectar al resto de AR.js. Asimismo, el código pueda modificarse para garantizar la compatibilidad con la versión más reciente de three.js sin afectar al resto de AR.js. Esto también significa que los desarrolladores pueden trabajar en el aspecto basado en la ubicación sin necesidad de comprender el componente basado en marcadores y NFT, y que no es necesario incluir jsartoolkit.

**NO HE CONSEGUIDO QUE FUNCIONE, MUCHOS PROBLEMAS CON LA CÁMARA Y EL NAVEGADOR.**
