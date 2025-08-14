// PARA FUTURAS VERSIONES HAY QUE ELIMINAR EL REPETIR CODIGO, PARAMETRIZANDO EL TAMAÑO DE LA HOJA

// Precios  de productos segun razor papeles:
// Carton 2mm A5 50 hojas - $15500

// Anillo de aluminio A4 de 22mm x 24 unidades = $23990
let polipropilenoCheckbox = document.getElementById("polipropileno");
let cantidadPolipropilenoInput = document.getElementById("cantidadPolipropileno");

polipropilenoCheckbox.addEventListener("change", function() {
    if (this.checked) {
        cantidadPolipropilenoInput.style.display = "inline";
    } else {
        cantidadPolipropilenoInput.style.display = "none";
        cantidadPolipropilenoInput.value = 0;
    }
});



let anilladoCheckbox = document.getElementById("anillado");
let tipoAnilladoInput = document.getElementById("tipoAnillado");

anilladoCheckbox.addEventListener("change", function() {
    if (this.checked) {
        tipoAnilladoInput.style.display = "inline";
    } else {
        tipoAnilladoInput.style.display = "none";
        tipoAnilladoInput.value = '';
    }
});



let stickersCheckbox = document.getElementById("stickers");
let cantidadStickersInput = document.getElementById("cantidadStickers");

stickersCheckbox.addEventListener("change", function() {
    if (this.checked) {
        cantidadStickersInput.style.display = "inline";
    } else {
        cantidadStickersInput.style.display = "none";
        cantidadStickersInput.value = '';
    }
});



let descuentoCheckbox = document.getElementById("descuento");
let porcentajeDescuentoInput = document.getElementById("porcentajeDescuento");

descuentoCheckbox.addEventListener("change", function() {
    if (this.checked) {
        porcentajeDescuentoInput.style.display = "inline";
    } else {
        porcentajeDescuentoInput.style.display = "none";
        porcentajeDescuentoInput.value = '';
    }
});



function calcularCostos() {
//Captura de inputs
let nombreProducto = document.getElementById("nombreProducto").value || '';
let tamanoProducto = document.getElementById("tamanoProducto").value || '';
let cantidadHojas = document.getElementById("cantidadHojas").value || 0;
let anillado = document.getElementById("anillado");
let tipoAnillado = document.getElementById("tipoAnillado").value || '';
let tipoTapas = document.getElementById("tipoTapas").value || '';
let polipropileno = document.getElementById("polipropileno");
let cantidadPolipropileno = document.getElementById("cantidadPolipropileno").value || 0;
let stickers = document.getElementById("stickers");
let cantidadStickers = document.getElementById("cantidadStickers").value || 0;
let descuento = document.getElementById("descuento");
let porcentajeDescuento = document.getElementById("porcentajeDescuento").value || 0;

//Captura de lugares para texto
let producto = document.getElementById("producto");
let costos = document.getElementById("costos");
let ganancias = document.getElementById("ganancias");
let precioPublico = document.getElementById("precioPublico");
let precioConDescuento = document.getElementById("precioConDescuento");



    //Precio en tamanos A4
    let precioPapelStickerA4 = 180;
    let precioEspiralPlasticoA4 = 212;
    let precioEspiralMetalA4 = 1000;
    let precioPolipropilenoA4 = 178;
    let precioHojaA4 = 12.5;
    let precioHojaDuraA4 = 92;
    
    //carton viene en A5
    let precioCartonDuroA5 = 310;
    switch(tamanoProducto){
        case 'A5':
            //seteo los precios para A5
            let precioPapelStickerA5 = precioPapelStickerA4 / 2;
            let precioEspiralPlasticoA5 = precioEspiralPlasticoA4 / 2;
            let precioEspiralMetalA5 = precioEspiralMetalA4 / 2;
            let precioPolipropilenoA5 = precioPolipropilenoA4 / 2; 
            let precioHojaA5 = precioHojaA4 / 2;
            let precioHojaDuraA5 = precioHojaDuraA4 / 2;

            let costoPapelStickerA5 = precioPapelStickerA5 * cantidadStickers;
            let costoEspiralA5;
            let costoTapaA5;
            let costoPolipropilenoA5 = precioPolipropilenoA5 * cantidadPolipropileno;
            let costoHojaA5 = precioHojaA5 * cantidadHojas;
            
            if(tipoAnillado == 'plastico'){
                costoEspiralA5 = precioEspiralPlasticoA5;
            }else if(tipoAnillado == 'metal'){
                costoEspiralA5 = precioEspiralMetalA5;
            }else{
                costoEspiralA5 = 0;
            }

            if(tipoTapas == 'dura'){
                costoTapaA5 = precioCartonDuroA5 * 2;
            }else if(tipoTapas == 'blanda'){
                costoTapaA5 = precioHojaDuraA5 * 2;
            }

            let costoTotalA5 = Math.round((costoPapelStickerA5 + costoEspiralA5 + costoTapaA5 + costoPolipropilenoA5 + costoHojaA5)*1.15);
        
            
            producto.innerText = 'Nombre del producto: ' + nombreProducto;
            costos.innerText = 'Costo del producto: $'+ Math.round(costoTotalA5);
            precioPublico.innerText = 'Precio al público sugerido: $'+ Math.round(costoTotalA5 * 5);
            ganancias.innerText = 'Ganancia del producto: $'+ Math.round(((costoTotalA5 * 5) - costoTotalA5));

            if (porcentajeDescuento != 0){
                precioConDescuento.innerText = 'Precio con descuento del '+porcentajeDescuento+'%: $' + Math.round((costoTotalA5 * 5) * (1 - porcentajeDescuento / 100));
            }

            console.log(precioPapelStickerA5, precioEspiralMetalA5, precioEspiralPlasticoA5, precioPolipropilenoA5, precioHojaA5,precioHojaDuraA5, precioCartonDuroA5);
            console.log(tamanoProducto);

            break;

        case 'A6':
            //seteo los precios para A6
            let precioPapelStickerA6 = precioPapelStickerA4 / 4;
            let precioEspiralPlasticoA6 = precioEspiralPlasticoA4 / 3;
            let precioEspiralMetalA6 = precioEspiralMetalA4 / 3;
            let precioPolipropilenoA6 = precioPolipropilenoA4 / 4; 
            let precioHojaA6 = precioHojaA4 / 4;
            let precioHojaDuraA6 = precioHojaDuraA4 / 4;
            let precioCartonDuroA6 = precioCartonDuroA5 /2;



            let costoPapelStickerA6 = precioPapelStickerA6 * cantidadStickers;
            let costoEspiralA6;
            let costoTapaA6;
            let costoPolipropilenoA6 = precioPolipropilenoA6 * cantidadPolipropileno;
            let costoHojaA6 = precioHojaA6 * cantidadHojas;
            
            if(tipoAnillado == 'plastico'){
                costoEspiralA6 = precioEspiralPlasticoA6;
            }else if(tipoAnillado == 'metal'){
                costoEspiralA6 = precioEspiralMetalA6;
            }else{
                costoEspiralA6 = 0;
            }

            if(tipoTapas == 'dura'){
                costoTapaA6 = precioCartonDuroA6 * 2;
            }else if(tipoTapas == 'blanda'){
                costoTapaA6 = precioHojaDuraA6 * 2;
            }

            let costoTotalA6 = Math.round((costoPapelStickerA6 + costoEspiralA6 + costoTapaA6 + costoPolipropilenoA6 + costoHojaA6)*1.15);
        
            
            producto.innerText = 'Nombre del producto: ' + nombreProducto;
            costos.innerText = 'Costo del producto: $'+ Math.round(costoTotalA6);
            precioPublico.innerText = 'Precio al público sugerido: $'+ Math.round(costoTotalA6 * 5);
            ganancias.innerText = 'Ganancia del producto: $'+ Math.round(((costoTotalA6 * 5) - costoTotalA6));

            if (porcentajeDescuento != 0){
                precioConDescuento.innerText = 'Precio con descuento del '+porcentajeDescuento+'%: $' + Math.round((costoTotalA6 * 5) * (1 - porcentajeDescuento / 100));
            }

            console.log(precioPapelStickerA6, precioEspiralMetalA6, precioEspiralPlasticoA6, precioPolipropilenoA6, precioHojaA6,precioHojaDuraA6, precioCartonDuroA6);
            console.log(tamanoProducto);
            break;

        case 'A7':
            //seteo los precios para A7
            let precioPapelStickerA7 = precioPapelStickerA4 / 8;
            let precioEspiralPlasticoA7 = precioEspiralPlasticoA4 / 5;
            let precioEspiralMetalA7 = precioEspiralMetalA4 / 5;
            let precioPolipropilenoA7 = precioPolipropilenoA4 / 8; 
            let precioHojaA7 = precioHojaA4 / 8;
            let precioHojaDuraA7 = precioHojaDuraA4 / 8;
            let precioCartonDuroA7 = precioCartonDuroA5 / 4;
            

            let costoPapelStickerA7 = precioPapelStickerA7 * cantidadStickers;
            let costoEspiralA7;
            let costoTapaA7;
            let costoPolipropilenoA7 = precioPolipropilenoA7 * cantidadPolipropileno;
            let costoHojaA7 = precioHojaA7 * cantidadHojas;
            
            if(tipoAnillado == 'plastico'){
                costoEspiralA7 = precioEspiralPlasticoA7;
            }else if(tipoAnillado == 'metal'){
                costoEspiralA7 = precioEspiralMetalA7;
            }else{
                costoEspiralA7 = 0;
            }

            if(tipoTapas == 'dura'){
                costoTapaA7 = precioCartonDuroA7 * 2;
            }else if(tipoTapas == 'blanda'){
                costoTapaA7 = precioHojaDuraA7 * 2;
            }

            let costoTotalA7 = Math.round((costoPapelStickerA7 + costoEspiralA7 + costoTapaA7 + costoPolipropilenoA7 + costoHojaA7)*1.15);
        
            
            producto.innerText = 'Nombre del producto: ' + nombreProducto;
            costos.innerText = 'Costo del producto: $'+ Math.round(costoTotalA7);
            precioPublico.innerText = 'Precio al público sugerido: $'+ Math.round(costoTotalA7 * 5);
            ganancias.innerText = 'Ganancia del producto: $'+ Math.round(((costoTotalA7 * 5) - costoTotalA7));

            if (porcentajeDescuento != 0){
                precioConDescuento.innerText = 'Precio con descuento del '+porcentajeDescuento+'%: $' + Math.round((costoTotalA7 * 5) * (1 - porcentajeDescuento / 100));
            }

            console.log(precioPapelStickerA7, precioEspiralMetalA7, precioEspiralPlasticoA7, precioPolipropilenoA7, precioHojaA7,precioHojaDuraA7, precioCartonDuroA7);
            console.log(tamanoProducto);

            break;
    }
}

document.getElementById("copiarTotales").addEventListener("click", function() {
    let contenido = document.getElementById("totalesFinales").innerText;
    
    navigator.clipboard.writeText(contenido)
        .then(() => {
            let toast = document.getElementById("toast");
            toast.style.opacity = "1"; // mostrar
            setTimeout(() => {
                toast.style.opacity = "0"; // ocultar después de 2 seg
            }, 2000);
        })
        .catch(err => {
            console.error("Error al copiar: ", err);
        });
});
