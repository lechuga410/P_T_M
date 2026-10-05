# Rastreo Patrimonial

Aplicación local para revisar patrimonio, movimientos y documentos financieros.

## Ejecutar

```sh
npm install
npm run dev
```

Vite muestra la dirección local en la terminal. Para crear y revisar una compilación:

```sh
npm run build
npm run lint
```

## Importar movimientos

En **Importar documentos** se pueden seleccionar o arrastrar archivos PNG, JPG, WEBP, BMP, TIFF, PDF, XLSX, CSV, OFX, QFX y TXT. La aplicación procesa los archivos en el navegador, permite corregir fecha, hora, descripción, monto, tipo y categoría antes de guardar, y marca posibles duplicados. La revisión no pide entidad, cuenta ni tasa: esos datos pertenecen al registro de la inversión.

Cada ingreso se asocia a una actividad generadora, que puede corregirse en la revisión de importación o al registrarlo manualmente. Por ahora los ingresos importados y los nuevos ingresos se proponen como `Empleo`; el Dashboard agrupa las actividades y calcula su participación porcentual en los ingresos del periodo seleccionado (3, 6 o 12 meses) en un gráfico circular. Este gráfico es independiente de **Distribución / Así se reparte**, que muestra la participación de cada cuenta de inversión sobre el patrimonio total.

Al registrar una inversión se debe indicar su fecha y hora de apertura; estos datos se guardan con la cuenta y se muestran en el portafolio para dar contexto a los cálculos posteriores. Las inversiones nuevas comienzan con saldo cero y aumentan al importar movimientos y asignarlos a la inversión correspondiente. Cada tarjeta abre una ficha propia y conserva la cuenta seleccionada en la URL para permitir recargar la vista sin perder la cuenta seleccionada.

El capital y los aportes vinculados pueden generar proyecciones de interés compuesto con la tasa anual efectiva (EA) registrada. En la ficha se puede guardar un saldo confirmado de Nu junto con la fecha y hora observadas; ese importe permanece exacto y es la base del saldo actual hasta que se registre una nueva confirmación o un aporte posterior. La gráfica de evolución muestra el saldo confirmado y los aportes registrados, manteniendo los meses sin movimientos; no extrapola rendimientos para alterar el saldo confirmado. Los periodos diario, semanal, mensual, trimestral, semestral y anual son proyecciones separadas desde el saldo actual, sin nuevos aportes. El campo de saldo acepta COP colombiano (`371.335,56`), decimal sin agrupadores (`371335,56`) o decimal con punto (`371335.56`); importes ambiguos o mal agrupados se rechazan en lugar de convertirse silenciosamente. Los valores proyectados usan la EA registrada y pueden diferir de Nu por horarios de abono, redondeos, variaciones de tasa e impuestos; no son telemetría ni saldo oficial en vivo. Los movimientos históricos se conservan; el timestamp verificado no los borra ni los reemplaza.

En el detalle de una inversión, cada gráfica tiene su propio control de horizonte: 1, 3, 6 y 12 meses o fechas personalizadas. La visualización de saldo conserva la escala propia de su serie. La gráfica adicional de capital aportado frente al rendimiento estimado usa una escala monetaria COP común, para que la distancia entre ambas líneas muestre la diferencia de magnitud y no se normalicen como si fueran cantidades equivalentes. El capital se reconstruye desde los aportes vinculados; antes de un saldo confirmado, el rendimiento histórico es una estimación por EA, no un registro diario real de la entidad. En el corte confirmado, la serie de rendimiento representa la diferencia entre el saldo verificado y el capital registrado; puede incluir importes que no estén registrados como aportes y no debe interpretarse como rendimiento certificado por Nu. Los aportes posteriores se incorporan al capital. Los controles solo cambian el intervalo visualizado y no modifican los datos guardados.

La ficha también conserva una serie diaria de interés compuesto estimado por inversión: al abrir la app completa días cerrados que falten desde el saldo de apertura, el último saldo confirmado o registro diario; cada fecha ya guardada queda fija. Usa EA, saldo inicial y aportes vinculados como estimación matemática, no equivale a los abonos reales de Nu. El modo `1 día · últimos 30` muestra hasta 30 cierres diarios (si la inversión tiene ese historial), y también hay rangos de 7, 30, 90, 180 y 365 días o fechas personalizadas. Al pasar el cursor o enfocar una barra se muestran el interés estimado, el saldo al cierre y los aportes del día. La proyección de largo plazo calcula el saldo del activo a 2, 3, 4, 5, 10, 20 y 30 años, suponiendo que la tasa EA no cambia y que no hay aportes nuevos; al pasar el cursor o enfocar un hito se ve el saldo y el crecimiento respecto a hoy. El historial diario también se incluye en el JSON de exportación.

El Dashboard conserva por separado una meta patrimonial activa y el historial de hitos alcanzados. Al superar el patrimonio una meta, se registra la fecha y hora local observada, se archiva el hito y queda disponible el registro de la siguiente meta. El historial se guarda en el navegador y también se incluye en la exportación JSON.

Las filas importadas se conservan como movimientos y los archivos originales no se guardan en la aplicación. Los archivos XLSX se limitan a 25 MB y a 50 MB de contenido XML expandido para proteger el navegador. Las imágenes y PDF escaneados se leen con OCR en el navegador; pueden requerir la descarga inicial del motor/modelo de idioma. Para capturas de movimientos Nu, el OCR intenta separar cada fila; si una compra incluye debajo un cobro 4x1000, lo presenta como un gasto de categoría `Impuesto`, con descripción `GMF / 4x1000`, asociado al pago de esa misma fila. Se mantienen los dos importes y la relación se conserva al guardar. El contenido financiero del documento no se envía a un servicio de análisis. El reconocimiento puede equivocarse: siempre hay que contrastar la revisión con el extracto original.

Los ingresos y gastos no se asignan a inversiones. En una transferencia donde el texto identifica un aporte a una Cajita, la revisión puede proponer una inversión Nu/Cajita coincidente; confirma o cambia el destino. Solo los movimientos de tipo transferencia pueden aumentar el saldo vinculado. Al eliminar el movimiento importado, se revierte ese aporte. Asigna únicamente abonos que aún no estén incluidos en el saldo guardado para evitar duplicarlos. Para las demás transferencias, deja “No aplica”.

## Límites contables actuales

La importación clasifica ingresos, gastos y transferencias entre cuentas propias. Las transferencias no cuentan como ingreso ni gasto en el flujo de caja. El GMF/4x1000 se registra como gasto de categoría `Impuesto` cuando aparece en el documento y se asocia al movimiento que lo generó; no se estima automáticamente porque depende, entre otros datos, de la cuenta exenta y del débito gravado.

La aplicación todavía no reconstruye saldos bancarios, deudas, transferencias de doble entrada ni el crecimiento de una inversión desde el momento exacto de cada abono. Un movimiento importado no sustituye por sí solo el saldo actual de una cuenta. Para calcularlo con rigor hacen falta extractos con saldo inicial/final y movimientos completos; la rentabilidad y sus reglas de liquidación también deben confirmarse con el estado de cuenta de la entidad.

Los registros se guardan en el almacenamiento local del navegador. Para ver los mismos datos, abre siempre la aplicación con el mismo origen (por ejemplo, `http://localhost:5173`); `localhost` y `127.0.0.1` mantienen almacenes separados. No existe una acción para borrar todos los datos desde la interfaz; las eliminaciones individuales requieren confirmación. El almacenamiento local no sustituye un respaldo: exporta periódicamente una copia JSON, ya que limpiar los datos del navegador o cambiar de dispositivo puede eliminar el acceso a los registros.
