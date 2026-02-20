
(function (global) {

  const _dataPaymentGlobal = new WeakMap();
  const _desingPaymentGlobal = new WeakMap();
  const _url = 'https://pago-qa.conceptopagos.com/cpagos-payment-gateway-ecm-endpoint-ws/rest/v1'
  //const _url = 'https://pago-dev.conceptopagos.com/cpagos-payment-gateway-ecm-endpoint-ws/rest/v1'
  const STEP_UP_MODAL_ID = "cmp-stepup-modal";

  const COLLECT_IFRAME_ID = 'cmp-collect-iframe';
  const COLLECT_FORM_ID   = 'cmp-collect-form';
  const STEPUP_IFRAME_ID  = 'cmp-stepup-iframe';
  const STEPUP_FORM_ID    = 'cmp-stepup-form';
  let stepUpTimerInterval = null;

  class CMPSDK {
    constructor(config, tokenParameters, desing) {
      let newDate = new Date();
      let tokenFinger = {
        fingerprintSessionId: '', 
        accessToken: '',
        tokenExpiration: '',
        midId: '',
        orgId: '',
        timestamp: newDate.toISOString().replace("T", " ").substring(0, 19),
        dataCard: {},
        dataReferences: {},
        apikeys: {
          merchantId: config.merchantId,
          clientId: config.clientId,
          applicationId: config.applicationId,
          nonce: config.nonce,
          clientReference: config.clientReference
        },
        parameters: tokenParameters.parameters,
        expiresAt: Date.now() + tokenParameters.parameters.expiresIn * 1000,
        referenceInformationToken: tokenParameters.referenceInformation
      }
      _dataPaymentGlobal.set(this, tokenFinger)
      _desingPaymentGlobal.set(this, desing)
    }

    async init() {

      const dataPayment = _dataPaymentGlobal.get(this);
      if (this.isTokenExpired()) {
        throw new Error("La sesión expiró");
      }

      const signature = await this.createSignature();
      dataPayment.signature = signature
      let dataSetupRes = await this.createDateSetup()
      dataPayment.fingerprintSessionId = dataSetupRes.fingerPrintSessionCs
      dataPayment.midId = dataSetupRes.midCs //"NOT_MID_ASSIGNED"
      dataPayment.orgId = dataSetupRes.orgIdCs
      
      this.createCardIframes();
      this.loadMetrixScript();
      this.injectSpinnerStyles();

    }


    createLoader() {
      const desing = _desingPaymentGlobal.get(this);
      if (document.getElementById("cmp-loader")) return;
      const overlay = document.createElement("div");
      overlay.id = "cmp-loader";
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(255,255,255,.85);
        z-index: 9998;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
      `;

      overlay.innerHTML = `
        <img src="${desing?.loader?.logo || ''}" style="max-width:120px;margin-bottom:20px" />
        <div class="cmp-spinner"></div>
        <div id="cmp-timer" style="margin-top:12px;font-size:14px;color:#555"></div>
      `;

      document.body.appendChild(overlay);
    }

    injectSpinnerStyles() {
      if (document.getElementById("cmp-spinner-style")) return;

      const style = document.createElement("style");
      style.id = "cmp-spinner-style";
      style.textContent = `
        .cmp-spinner {
          width: 48px;
          height: 48px;
          border: 4px solid #ddd;
          border-top-color: #0A2540;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
    startLoading() {
      this.createLoader();
    }
    stopLoading() {
      const loader = document.getElementById("cmp-loader");
      if (loader) loader.remove();
    }
    pauseLoading() {
      const loader = document.getElementById("cmp-loader");
      if (loader) loader.style.display = "none";
    }
    resumeLoading() {
      const loader = document.getElementById("cmp-loader");
      if (loader) loader.style.display = "flex";
    }


    createCardIframes() {
      const dataPayment = _dataPaymentGlobal.get(this);
      const design = _desingPaymentGlobal.get(this);

      dataPayment.cardForm = CardForm.create({
        fields: {
          number: { selector: "#card-number" },
          expiration: { selector: "#expiration" },
          cvv: { selector: "#cvv" }
        },
        styles: design?.fields || {}
      });

      // capturar tokens emitidos por los iframes
      window.addEventListener("message", (event) => {
        if (event.data?.type === "CARD_TOKEN"){
          if(event.data?.valid){
            dataPayment.dataCard.card = event.data.token;
            dataPayment.dataCard.card = dataPayment.dataCard.card.replace("card_", "");
            dataPayment.dataCard.card = atob(dataPayment.dataCard.card);  
          }else{
            dataPayment.dataCard.card = null;
          }
        } 
        if (event.data?.type === "EXP_TOKEN"){
          if(event.data?.valid){
            dataPayment.dataCard.exp = event.data.token;
            dataPayment.dataCard.exp = dataPayment.dataCard.exp.replace("exp_", "");
            dataPayment.dataCard.exp = atob(dataPayment.dataCard.exp);   
          }else{
            dataPayment.dataCard.exp = null;
          }
        } 
        if (event.data?.type === "CVV_TOKEN"){
          if(event.data?.valid){
            dataPayment.dataCard.cvv = event.data.token;
            dataPayment.dataCard.cvv = dataPayment.dataCard.cvv.replace("cvv_", "");
            dataPayment.dataCard.cvv = atob(dataPayment.dataCard.cvv);   
          }else{
            dataPayment.dataCard.cvv = null
          }
        } 
      });
    }
    markFieldsAsError(invalidFields) {
      const dataPayment = _dataPaymentGlobal.get(this);
      const design = _desingPaymentGlobal.get(this);
      const iframes = dataPayment.cardForm?.iframes;

      if (!iframes) return;
      invalidFields.forEach(field => {
        const iframe = iframes[field];
        iframe?.contentWindow?.postMessage({
          type: 'FIELD_ERROR',
          styles: design?.fields?.error || {
            border: '2px solid red'
          }
        }, '*');
      });
    }

    isTokenExpired() {
      const dataPayment = _dataPaymentGlobal.get(this);
      if (!dataPayment?.expiresAt) {
        return true;
      }
      return Date.now() > dataPayment.expiresAt;
    }

    loadMetrixScript() {
      const dataPayment = _dataPaymentGlobal.get(this);

      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `https://h.online-metrix.net/fp/tags.js?org_id=${dataPayment.orgId}&session_id=${dataPayment.midId+dataPayment.fingerprintSessionId}`;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);

        const iframe = document.createElement("iframe");
        iframe.src = `https://h.online-metrix.net/fp/tags.js?org_id=${dataPayment.orgId}&session_id=${dataPayment.midId+dataPayment.fingerprintSessionId}`;
        iframe.style.display = "none";
        document.body.appendChild(iframe);
      });
    }

    /** 4. GENERAR PAGO COMPLETO **/
    async generatePayment(dataPaymentClient) {
      this.startLoading();
      dataPaymentClient.saveCard = dataPaymentClient.saveCard ?? false;
      dataPaymentClient.cardReference = dataPaymentClient.cardReference ?? null;

      //Validar tiempo de token
      if (this.isTokenExpired()) {
        this.stopLoading()
        throw new Error("La sesión expiró");
      }
      // Recuperar los valores globales del sdkx
      const dataPayment = _dataPaymentGlobal.get(this);

      // Validar campos mínimos
      this.validatePaymentData(dataPaymentClient);

      if(dataPaymentClient?.cardReference){
        // Validar tokens
        if (!dataPayment.dataCard.cvv) {
          this.stopLoading();
          const invalidFields = [];
          if (!dataPayment.dataCard.cvv) invalidFields.push('cvv');
          this.markFieldsAsError(invalidFields)
          throw new Error("No se resgistraron los datos completos de la tarjeta.");
        }
        // Guardar en estado
        dataPayment.dataCard.name = dataPaymentClient.name;
        dataPayment.dataCard.email = dataPaymentClient.email;
        dataPayment.dataCard.amount = dataPaymentClient.amount;
        dataPayment.dataCard.concept = dataPaymentClient.concept;
        dataPayment.dataCard.phone = dataPaymentClient.phone;
        dataPayment.dataCard.saveCard = false;
        dataPayment.dataCard.cardReference = dataPaymentClient.cardReference;
      }else{
        // Validar tokens
        if (!dataPayment.dataCard.card || !dataPayment.dataCard.exp || !dataPayment.dataCard.cvv) {
          this.stopLoading();
          const invalidFields = [];
          if (!dataPayment.dataCard.card) invalidFields.push('number');
          if (!dataPayment.dataCard.exp) invalidFields.push('expiration');
          if (!dataPayment.dataCard.cvv) invalidFields.push('cvv');
          this.markFieldsAsError(invalidFields)
          throw new Error("No se resgistraron los datos completos de la tarjeta.");
        }
        // Guardar en estado
        dataPayment.dataCard.name = dataPaymentClient.name;
        dataPayment.dataCard.email = dataPaymentClient.email;
        dataPayment.dataCard.amount = dataPaymentClient.amount;
        dataPayment.dataCard.concept = dataPaymentClient.concept;
        dataPayment.dataCard.phone = dataPaymentClient.phone;
        dataPayment.dataCard.saveCard = dataPaymentClient.saveCard ?? false;
        dataPayment.dataCard.cardReference = null;
        
      }

      //Consultar servicio obtener referencia de informacion de tarjeta
      let referenceInfoRes = await this.createReferenceInfo();
      //Recolectar informacion del servicio createReferenceInfo
      dataPayment.dataReferences.referenceInformation = referenceInfoRes.referenceInformation

      if(dataPayment.midId == 'NOT_MID_ASSIGNED'){
        let requestPayment = {
          "referenceInformation": dataPayment.dataReferences.referenceInformation,
          "storeCard": dataPayment.dataCard.saveCard,
          "fingerPrintSessionCs": dataPayment.fingerprintSessionId,
          "threeDsData": null
        }
        if(dataPayment.dataCard.saveCard) requestPayment.clientReference = dataPayment.apikeys.clientReference
        this.stopLoading();
        return {
          description: "Validación completada",
          header: this.setHeaders(),
          body: requestPayment
        };
      }else{
        //Consultar validacion de pago por referencia de tarjeta
        let decisionManagerRes = await this.createDecisionManager();
        //console.log('Servicios consumido decision', decisionManagerRes)
        if(decisionManagerRes?.dmResponse?.status == "ACCEPTED"){
          let requestPayment = {
            "referenceInformation": dataPayment.dataReferences.referenceInformation,
            "storeCard": dataPayment.dataCard.saveCard, //Guardado de tarjeta variable
            "fingerPrintSessionCs": dataPayment.fingerprintSessionId,
            "threeDsData": null
          }
          if(dataPayment.dataCard.saveCard) requestPayment.clientReference = dataPayment.apikeys.clientReference
          this.stopLoading();
          return {
            description: "Validación completada",
            header: this.setHeaders(),
            body: requestPayment
          };
        }else{
          if(decisionManagerRes?.dmResponse?.status == "PENDING_REVIEW" && decisionManagerRes?.dmResponse?.id){
  
            if (!decisionManagerRes?.dmResponse?.clientReferenceInformation.code || !decisionManagerRes?.dmResponse?.id) {
              this.stopLoading();
              throw new SDKHttpError({
                status: 200,
                code: "INVALID_RESPONSE",
                message: "El servicio de antifraude no obtuvo respuesta",
                detail: decisionManagerRes
              });
            }
            //Recolectar informacion del servicio createDecisionManager
            dataPayment.dataReferences.codeClient = decisionManagerRes?.dmResponse?.clientReferenceInformation.code;
            dataPayment.dataReferences.idDecisionManager = decisionManagerRes?.dmResponse?.id;
  
            //Consultar servicio obtener steup
            let setupRes = await this.createSetup();
            //console.log('Servicios consumido setup', setupRes)
            if(!setupRes?.consumerAuthenticationInformation?.accessToken ||
              !setupRes?.consumerAuthenticationInformation?.deviceDataCollectionUrl ||
              !setupRes?.consumerAuthenticationInformation?.referenceId
            ){
              this.stopLoading();
              throw new SDKHttpError({
                status: 200,
                code: "INVALID_RESPONSE", 
                message: "Transacción no autorizada, algo salió mal y no pudimos procesar tu pago. Intenta de nuevo en unos minutos o prueba con otra tarjeta.",
                detail: {}
              });
            }
            dataPayment.dataReferences.collectUrl = setupRes.consumerAuthenticationInformation.deviceDataCollectionUrl
            dataPayment.dataReferences.collectToken = setupRes.consumerAuthenticationInformation.accessToken
            dataPayment.dataReferences.referenceId = setupRes.consumerAuthenticationInformation.referenceId
  
            const form = this.createIframeCollect();
            form.submit();
            //Al ejecutar y iframe esperamos 10seg para continuar con el proceso
            await this.delay(10000);
            //Ejecutar servicio de enrollment
            let enrollmentRes = await this.createEnrollment();
            //console.log('Servicios consumido setup', enrollmentRes)
  
            if(enrollmentRes?.status == 'AUTHENTICATION_SUCCESSFUL'){
              if(enrollmentRes.consumerAuthenticationInformation.dsXid && 
                enrollmentRes.consumerAuthenticationInformation.cavv && 
                enrollmentRes.consumerAuthenticationInformation.eci){
                dataPayment.dataReferences.dsXid = enrollmentRes.consumerAuthenticationInformation.dsXid
                dataPayment.dataReferences.cavv = enrollmentRes.consumerAuthenticationInformation.cavv
                dataPayment.dataReferences.eci = enrollmentRes.consumerAuthenticationInformation.eci.substring(1)
                let requestPayment = {
                  "referenceInformation": dataPayment.dataReferences.referenceInformation,
                  "storeCard": dataPayment.dataCard.saveCard,
                  "fingerPrintSessionCs": dataPayment.fingerprintSessionId,
                  "threeDsData": {
                      "version3ds": "2",
                      "ucaf3ds": dataPayment.dataReferences.cavv,
                      "eci3ds": response.consumerAuthenticationInformation.eci.substring(1),
                      "protocolo3ds": "2",//fijo
                      "dsxId3ds": dataPayment.dataReferences.dsXid
                  }
                }
                if(dataPayment.dataCard.saveCard) requestPayment.clientReference = dataPayment.apikeys.clientReference
                return {
                  description: "Validación completada",
                  header: this.setHeaders(),
                  body: requestPayment
                };
              }else{
                this.stopLoading();
                throw new SDKHttpError({
                  status: 200,
                  code: "INVALID_RESPONSE", 
                  message: "Transacción no autorizada, algo salió mal y no pudimos procesar tu pago. Intenta de nuevo en unos minutos o prueba con otra tarjeta.",
                  detail: {}
                });
              }
            }else if(enrollmentRes?.status == 'PENDING_AUTHENTICATION'){
  
              dataPayment.dataReferences.stepupUrl = enrollmentRes.consumerAuthenticationInformation.stepUpUrl
              dataPayment.dataReferences.stepupToken = enrollmentRes.consumerAuthenticationInformation.accessToken
  
              this.stopLoading(); // ⬅️ eliminar completamente
              const formSteup = this.createIframeStepUp();
              formSteup.submit();
  
  
              //Ejecutar servicio de recuperar transaction id
              const transactionRes = await this.pollTransactionId();
              console.log('Respuesta de key', transactionRes)
              dataPayment.dataReferences.transactionId = transactionRes.transactionId
              //console.log(transactionRes)
  
              //Ejecutar servicio de validacion de llave
              let validateKeySend = await this.sendValidateKey();
              //console.log('Respuesta validete', validateKeySend)
  
              if(validateKeySend?.status == "AUTHENTICATION_SUCCESSFUL"){
                if(validateKeySend?.consumerAuthenticationInformation?.directoryServerTransactionId && validateKeySend?.consumerAuthenticationInformation?.cavv && validateKeySend?.consumerAuthenticationInformation?.eci){
                  dataPayment.dataReferences.dsXid = validateKeySend.consumerAuthenticationInformation.directoryServerTransactionId
                  dataPayment.dataReferences.cavv = validateKeySend.consumerAuthenticationInformation.cavv
                  dataPayment.dataReferences.eci = validateKeySend.consumerAuthenticationInformation.eci.substring(1)
                  let requestPayment = {
                    "referenceInformation": dataPayment.dataReferences.referenceInformation,
                    "storeCard": dataPayment.dataCard.saveCard,
                    "fingerPrintSessionCs": dataPayment.fingerprintSessionId,
                    "threeDsData": {
                        "version3ds": "2",
                        "ucaf3ds": dataPayment.dataReferences.cavv,
                        "eci3ds": dataPayment.dataReferences.eci,
                        "protocolo3ds": "2",//fijo
                        "dsxId3ds": dataPayment.dataReferences.dsXid
                    }
                  }
                  if(dataPayment.dataCard.saveCard) requestPayment.clientReference = dataPayment.apikeys.clientReference
                  return {
                    description: "Validación completada",
                    header: this.setHeaders(),
                    body: requestPayment
                  };
                }else{
                  this.stopLoading();
                  throw new SDKHttpError({
                    status: 200,
                    code: "INVALID_RESPONSE", 
                    message: "Transacción no autorizada, algo salió mal y no pudimos procesar tu pago. Intenta de nuevo en unos minutos o prueba con otra tarjeta.",
                    detail: {}
                  });
                }
              }else{
                this.stopLoading();
                throw new SDKHttpError({
                  status: 200,
                  code: "INVALID_RESPONSE", 
                  message: "Transacción no autorizada, por favor, intente de nuevo o contacte a su banco",
                  detail: {}
                });
              }
            }else{
              this.stopLoading();
              throw new SDKHttpError({
                status: 200,
                code: "INVALID_RESPONSE", 
                message: "Transacción no autorizada, algo salió mal y no pudimos procesar tu pago. Intenta de nuevo en unos minutos o prueba con otra tarjeta.",
                detail: {}
              });
            }
  
  
  
  
          }else{
            this.stopLoading();
            throw new SDKHttpError({
              status: 200,
              code: "INVALID_RESPONSE", 
              message: "Transacción no autorizada, algo salió mal y no pudimos procesar tu pago. Intenta de nuevo en unos minutos o prueba con otra tarjeta.",
              detail: {}
            });
          }
        }
      }
    }
    
    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getListCard() {
      const listCard = await this.listCard();
      if (listCard?.code == 404) {
        return {
          status: "FAILED",
          response: listCard
        };
      }
      return {
        status: "SUCCESS",
        response: listCard
      };
    }

    async deleteCard(cardReference) {
      cardReference = cardReference.trim() 
      if (!cardReference) return;
      const deleteRes = await this.deleteCardService(cardReference);
      if (deleteRes?.code != 200) {
        return {
          status: "FAILED",
          response: listCard
        };
      }
      return {
        status: "SUCCESS",
        response: deleteRes
      };
    }
    

    async pollTransactionId() {
      const maxAttempts = 23;
      const intervalMs = 5000; //5s * 23 = 115s (+ 5s de espera)
      let elapsed = 0;
      const timerInterval = setInterval(() => {
        elapsed += intervalMs / 1000;
      }, intervalMs);

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const res = await this.getTransactionId();
          if (res?.transactionId) {
            console.log('Cerrando modal')
            clearInterval(timerInterval);
            this.closeStepUpModal();
            return res;
          }
        } catch (error) {
          if (attempt === maxAttempts) {
            clearInterval(timerInterval);
            this.closeStepUpModal();
            throw error;
          }
        }
        await this.sleep(intervalMs);
      }
      clearInterval(timerInterval);
      this.closeStepUpModal();
      throw new SDKHttpError({
        status: 408,
        code: "OTP_TIMEOUT",
        message: "El tiempo para ingresar el código de verificación ha expirado.",
        detail: {}
      });
    }
    
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }


    
 

    /* Validacion datos form index */
    /* validatePaymentData(data) {
      const required = ["name", "email", "amount", "concept", "phone"];
      const missing = required.filter(k => !data[k] || data[k].trim() === "");
      if (missing.length > 0) {
        this.stopLoading();
        throw new Error("Faltan los siguientes campos: " + missing.join(", "));
      }
    } */
    validatePaymentData(data) {
      const errors = [];
      console.log(data)
      if (!this._isNonEmptyString(data.name) || data.name.length < 3) {
        errors.push("name");
      }
      if (!this._isNonEmptyString(data.email) || !this._isValidEmail(data.email)) {
        errors.push("email");
      }
      if (!this._isPositiveNumber(data.amount)) {
        errors.push("amount");
      }
      if (!this._isNonEmptyString(data.concept)) {
        errors.push("concept");
      }
      if (!this._isNonEmptyString(data.phone) || !this._isValidPhone(data.phone)) {
        errors.push("phone");
      }
      if (typeof data.saveCard != "boolean") {
        errors.push("saveCard");
      }
      if (data.cardReference ? !this._isNonEmptyString(data.cardReference) : false) {
        errors.push("cardReference");
      }
      if (errors.length > 0) {
        this.stopLoading();
        throw new Error(
          `Datos de pago inválidos. Campos incorrectos: ${errors.join(", ")}`
        );
      }
    }
    _isString(value) {
      return typeof value === "string";
    }
    _isNonEmptyString(value) {
      return this._isString(value) && value.trim().length > 0;
    }
    _isValidEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
    _isValidPhone(phone) {
      return /^[0-9]{10,15}$/.test(phone);
    }
    _isPositiveNumber(value) {
      return typeof value === "number" && !isNaN(value) && value > 0;
    }

    


    /** Crear iframe */
    createIframeCollect() {
      this.removeElementById(COLLECT_IFRAME_ID);
      this.removeElementById(COLLECT_FORM_ID);

      const dataPayment = _dataPaymentGlobal.get(this);
      const iframe = document.createElement("iframe");
      iframe.id = COLLECT_IFRAME_ID;
      iframe.name = "collectionIframe";
      iframe.style.display = "none";
      document.body.appendChild(iframe);

      const form = document.createElement("form");
      form.id = COLLECT_FORM_ID;
      form.method = "POST";
      form.target = "collectionIframe";
      form.action = dataPayment.dataReferences.collectUrl;

      const inputJwt = document.createElement("input");
      inputJwt.type = "hidden";
      inputJwt.name = "JWT";
      inputJwt.value = dataPayment.dataReferences.collectToken
      form.appendChild(inputJwt);
      document.body.appendChild(form);
      
      return form;
    }

    createIframeStepUp() {
      const dataPayment = _dataPaymentGlobal.get(this);
      this.closeStepUpModal(); // Inicia correctamente
      this.removeElementById(STEPUP_IFRAME_ID);
      this.removeElementById(STEPUP_FORM_ID);


      // Overlay
      const overlay = document.createElement("div");
      overlay.id = STEP_UP_MODAL_ID;
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      // Modal
      const modal = document.createElement("div");
      modal.style.cssText = `
        background: #fff;
        width: 420px;
        height: 480px;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 10px 30px rgba(0,0,0,.3);

        display: flex;
        flex-direction: column;
        position: relative;
      `;

      const header = document.createElement("div");
      header.style.cssText = `
        padding: 12px 16px;
        background: #f8f9fa;
        border-bottom: 1px solid #e5e5e5;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: 600;
      `;
      const title = document.createElement("span");
      title.textContent = "Verificación OTP";

      const timer = document.createElement("span");
      timer.style.cssText = `
        font-family: monospace;
      `;

      header.appendChild(title);
      header.appendChild(timer);

      // Iframe
      const iframe = document.createElement("iframe");
      iframe.id = STEPUP_IFRAME_ID;
      iframe.name = "step-up-iframe";
      iframe.style.cssText = `
        width: 100%;
        flex: 1;
        border: none;
      `;

      modal.appendChild(header);
      modal.appendChild(iframe);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      //Inicio del tiempo
      this.startStepUpTimer(120, timer, () => {
        this.closeStepUpModal();
      });

      // Form POST
      const form = document.createElement("form");
      form.id = STEPUP_FORM_ID;
      form.method = "POST";
      form.target = "step-up-iframe";
      form.action = dataPayment.dataReferences.stepupUrl;

      const inputJwt = document.createElement("input");
      inputJwt.type = "hidden";
      inputJwt.name = "JWT";
      inputJwt.value = dataPayment.dataReferences.stepupToken;

      const inputMD = document.createElement("input");
      inputMD.type = "hidden";
      inputMD.name = "MD";
      inputMD.value = dataPayment.fingerprintSessionId;

      form.appendChild(inputJwt);
      form.appendChild(inputMD);
      document.body.appendChild(form);

      return form;
    }

    startStepUpTimer(durationSeconds, timerElement, onExpire) {
      let remaining = durationSeconds; //
      const formatTime = (seconds) => {
        const m = String(Math.floor(seconds / 60)).padStart(2, "0");
        const s = String(seconds % 60).padStart(2, "0");
        return `${m}:${s}`;
      };

      timerElement.textContent = formatTime(remaining);

      stepUpTimerInterval = setInterval(() => {
        remaining--;

        if (remaining <= 0) {
          clearInterval(stepUpTimerInterval);
          stepUpTimerInterval = null;
          timerElement.textContent = "00:00";
          onExpire?.();
          return;
        }

        timerElement.textContent = formatTime(remaining);
      }, 1000);
    }


    removeElementById(id) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }

    closeStepUpModal() {
      if (stepUpTimerInterval) {
        clearInterval(stepUpTimerInterval);
        stepUpTimerInterval = null;
      }
      const modal = document.getElementById(STEP_UP_MODAL_ID);
      if (modal) {
        modal.remove();
      }
    }

    /* Consulta de servicios */
    async createSignature(){
      const dataPayment = _dataPaymentGlobal.get(this);
      let header = {
        "Content-Type": "application/json",
        merchantRegistrationId: dataPayment.apikeys.merchantId,
        applicationId: dataPayment.apikeys.applicationId,
        accessKeyToken: dataPayment.parameters.accessKeyId,
        secretKeyToken: dataPayment.parameters.secretAccessKey,
        secretKey: dataPayment.apikeys.clientId,
        timestamp: dataPayment.timestamp,
        nonce: dataPayment.apikeys.nonce
      }
      let res;
      try {
        res = await fetch(`${_url}/authentication/signature-generate`, {
          method: "POST",
          headers: header,
          body: null
        });
      } catch (e) {
        throw new SDKHttpError({
          status: 0,
          code: "NETWORK_ERROR",
          message: "Error inesperado en el servicio de signature",
          detail: e
        });
      }
      if (!res.ok) {
        this.stopLoading();
        throw new SDKHttpError({
          status: res.status,
          code: body?.code || "API_ERROR",
          message: body?.message || body?.description || "Error inesperado en servicio de signature",
          detail: body
        });
      }
      const signature = await res.text();
      return signature;
    }

    async createDateSetup(){
      let res;
      let body;
      try {
        res = await fetch(`${_url}/checkout/parameters-setup`, {
          method: "POST",
          headers: this.setHeaders()
        });
        body = await res.json();
      } catch (e) {
        throw new SDKHttpError({
          status: 0,
          code: "NETWORK_ERROR",
          message: "Error inesperado en el servicio de parameters",
          detail: e
        });
      }
      if (!res.ok) {
        this.stopLoading();
        throw new SDKHttpError({
          status: res.status,
          code: body?.code || "API_ERROR",
          message: body?.message || body?.description || "Error inesperado en el servicio de parameters.",
          detail: body
        });
      }
      if (!body?.fingerPrintSessionCs || !body?.midCs || !body?.orgIdCs) {
        this.stopLoading();
        throw new SDKHttpError({
          status: 200,
          code: "INVALID_RESPONSE",
          message: "La respuesta del servicio de parameters no contiene respuesta.",
          detail: body
        });
      }
      return body;
    }
    
    async createReferenceInfo(){
      const dataPayment = _dataPaymentGlobal.get(this);
      const request = {
        "numberCard": dataPayment.dataCard.cardReference ? null : dataPayment.dataCard.card, //"4000000000002503", mandar null si viene cardReference
        "expirationMonth": dataPayment.dataCard.cardReference ? null : dataPayment.dataCard.exp.substring(0, 2), //mandar null si viene cardReference
        "expirationYear": dataPayment.dataCard.cardReference ? null : dataPayment.dataCard.exp.substring(3, 5), //mandar null si viene cardReference
        "cvv": dataPayment.dataCard.cvv,
        "type": "",
        "currency":"MXN",
        "ammount": dataPayment.dataCard.amount, 
        "name": dataPayment.dataCard.name,
        "mail": dataPayment.dataCard.email,
        "phoneNumber": dataPayment.dataCard.phone, 
        "concept": dataPayment.dataCard.concept,
        "cardReference": dataPayment.dataCard.cardReference ?? null // Si es pago con tarjeta ya seleccionada
      }
      let res;
      let body;
      try {
        res = await fetch(`${_url}/checkout/references`, {
          method: "POST",
          headers: this.setHeaders(),
          body: JSON.stringify(request)
        });
        body = await res.json();
      } catch (e) {
        this.stopLoading();
        throw new SDKHttpError({
          status: 0,
          code: "NETWORK_ERROR",
          message: "Error inesperado en el servicio de references",
          detail: e
        });
      }
      if (!res.ok) {
        this.stopLoading();
        throw new SDKHttpError({
          status: res.status,
          code: body?.code || "API_ERROR",
          message: body?.message || body?.description || "Error inesperado al crear referencia de tarjeta",
          detail: body
        });
      }
      if (!body?.referenceInformation) {
        this.stopLoading();
        throw new SDKHttpError({
          status: 200,
          code: "INVALID_RESPONSE",
          message: "La respuesta del servicio no contiene referencia de la tarjeta",
          detail: body
        });
      }
      return body;
    }

    async createDecisionManager(){
      const dataPayment = _dataPaymentGlobal.get(this);
      const request = {
        "deviceType" : this.isMobileDevice() ? "MOBILE" : "WEB", //Si es navegador de computador o de app (Hay un validacion en form)
        "referenceInformation" : dataPayment.dataReferences.referenceInformation, //Dato unico que lo da reference info
        "deviceInformation": {
          "ipAddress": "",
          "httpAcceptContent": navigator.mimeTypes ? this.getAcceptContent() : "",
          "httpBrowserLanguage": navigator.language || "",
          "httpBrowserJavaEnabled": navigator.javaEnabled ? navigator.javaEnabled() : false,
          "httpBrowserJavaScriptEnabled": true,
          "httpBrowserColorDepth": screen.colorDepth || "",
          "httpBrowserScreenHeight": screen.height || "",
          "httpBrowserScreenWidth": screen.width || "",
          "httpBrowserTimeDifference": this.getTimeDifference(),
          "userAgentBrowserValue": navigator.userAgent || "",
          "fingerprintSessionId": dataPayment.fingerprintSessionId
        }
      }
      let res;
      let body;
      try {
        res = await fetch(`${_url}/checkout/fraud/validation`, {
          method: "POST",
          headers: this.setHeaders(),
          body: JSON.stringify(request)
        });
        body = await res.json();
      } catch (e) {
        this.stopLoading();
        throw new SDKHttpError({
          status: 0,
          code: "NETWORK_ERROR",
          message: "Error inesperado en el servicio de validation",
          detail: e
        });
      }
      if (!res.ok) {
        this.stopLoading();
        throw new SDKHttpError({
          status: res.status,
          code: body?.code || "API_ERROR",
          message: body?.message || body?.description || "Error inesperado en servicio de antifraude",
          detail: body
        });
      }
      if (!body?.dmResponse) {
        this.stopLoading();
        throw new SDKHttpError({
          status: 200,
          code: "INVALID_RESPONSE",
          message: "El servicio de antifraude no obtuvo respuesta.",
          detail: body
        });
      }
      return body;


    }

    async createSetup(){
      const dataPayment = _dataPaymentGlobal.get(this);
      const request = {
        "codeClient": dataPayment.dataReferences.codeClient, 
        "referenceInformation": dataPayment.dataReferences.referenceInformation,
        "mid": dataPayment.midId
      }
      let res;
      let body;
      try {
        res = await fetch(`${_url}/checkout/fraud/setup`, {
          method: "POST",
          headers: this.setHeaders(),
          body: JSON.stringify(request)
        });
        body = await res.json();
      } catch (e) {
        this.stopLoading();
        throw new SDKHttpError({
          status: 0,
          code: "NETWORK_ERROR",
          message: "Error inesperado en el servicio de setup",
          detail: e
        });
      }
      if (!res.ok) {
        this.stopLoading();
        throw new SDKHttpError({
          status: res.status,
          code: body?.code || "API_ERROR",
          message: body?.message || body?.description || "Error inesperado en servicio de setup",
          detail: body
        });
      }
      return body;
    }

    async createEnrollment(){
      const dataPayment = _dataPaymentGlobal.get(this);
      const request = {
          "codeClient": dataPayment.dataReferences.codeClient, 
          "referenceInformation": dataPayment.dataReferences.referenceInformation,
          "mid": dataPayment.midId,
          "idDecisionManager": dataPayment.dataReferences.idDecisionManager,
          "consumerAuthenticationInformation": {
            "returnUrl": `${_url}/antifraud/step-up`,
            "deviceChannel": "",
            "overridePaymentMethod": "CR", // informcion como "DB" o "CR" si la tarjeta es debito o credido
            "productCode": "", 
            "referenceId": dataPayment.dataReferences.referenceId, // Se recupera del setup el
            "transactionMode": "eCommerce",
            "requestorName":"",
            "requestorId":"",
            "mcc":""
         },
        "deviceInformation": {
          "ipAdress": "",
          "httpAcceptContent": navigator.mimeTypes ? this.getAcceptContent() : "",
          "httpBrowserLanguage": navigator.language || "",
          "httpBrowserJavaEnabled": navigator.javaEnabled ? navigator.javaEnabled() : false,
          "httpBrowserJavaScriptEnabled": true,
          "httpBrowserColorDepth": screen.colorDepth || "",
          "httpBrowserScreenHeight": screen.height || "",
          "httpBrowserScreenWidth": screen.width || "",
          "httpBrowserTimeDifference": this.getTimeDifference(),
          "userAgentBrowserValue": navigator.userAgent || "",
          "fingerprintSessionId": dataPayment.fingerprintSessionId
        }

      }
      let res;
      let body;
      try {
        res = await fetch(`${_url}/checkout/fraud/enrollment`, {
          method: "POST",
          headers: this.setHeaders(),
          body: JSON.stringify(request)
        });
        body = await res.json();
      } catch (e) {
        this.stopLoading();
        throw new SDKHttpError({
          status: 0,
          code: "NETWORK_ERROR",
          message: "Error inesperado en el servicio de enrollment",
          detail: e
        });
      }
      if (!res.ok) {
        this.stopLoading();
        throw new SDKHttpError({
          status: res.status,
          code: body?.code || "API_ERROR",
          message: body?.message || body?.description || "Error inesperado en servicio de setup",
          detail: body
        });
      }
      return body;
    }

    async sendValidateKey(){
      const dataPayment = _dataPaymentGlobal.get(this);
      const request = {
          "codeClient": dataPayment.dataReferences.codeClient, 
          "referenceInformation": dataPayment.dataReferences.referenceInformation,
          "mid": dataPayment.midId,
          "idDecisionManager": dataPayment.dataReferences.idDecisionManager,
          "consumerAuthenticationInformation": {
            "authenticationTransactionId": dataPayment.dataReferences.transactionId //"SrRcxbSiEfmQEJjj7lF0"
          }
      }
      let res;
      let body;
      try {
        res = await fetch(`${_url}/checkout/fraud/validate-key`, {
          method: "POST",
          headers: this.setHeaders(),
          body: JSON.stringify(request)
        });
        body = await res.json();
      } catch (e) {
        this.stopLoading();
        throw new SDKHttpError({
          status: 0,
          code: "NETWORK_ERROR",
          message: "Error inesperado en el servicio de validate-key",
          detail: e
        });
      }
      if (!res.ok) {
        this.stopLoading();
        throw new SDKHttpError({
          status: res.status,
          code: body?.code || "API_ERROR",
          message: body?.message || body?.description || "Error inesperado en servicio de setup",
          detail: body
        });
      }
      return body;
    }

    async getTransactionId(){
      const dataPayment = _dataPaymentGlobal.get(this);
      let res;
      let body;
      try {
        res = await fetch(`${_url}/checkout/fraud/step-up-result/${dataPayment.fingerprintSessionId}`, {
          method: "GET",
          headers: this.setHeaders()
        });
        body = await res.json();
      } catch (e) {
        this.stopLoading();
        throw new SDKHttpError({
          status: 0,
          code: "NETWORK_ERROR",
          message: "Error inesperado en el servicio de step up result",
          detail: e
        });
      }
      /* if (!res.ok) {
        this.stopLoading();
        throw new SDKHttpError({
          status: res.status,
          code: body?.code || "API_ERROR",
          message: body?.message || body?.description || "Error inesperado en servicio de step up result",
          detail: body
        });
      } */
      return body;
    }

    async listCard() {
      const dataPayment = _dataPaymentGlobal.get(this);
      let res;
      let body;
       try {
        res = await fetch(`${_url}/checkout/cards`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "cpagos-merchant-id": dataPayment.apikeys.merchantId,
            "cpagos-signature": dataPayment.signature,
            "Authorization": dataPayment.parameters.accessToken,
            "cpagos-nonce": dataPayment.apikeys.nonce,
            "cpagos-timestamp": dataPayment.timestamp,
            "client-reference": dataPayment.apikeys.clientReference
          },
        });
        body = await res.json();
       } catch (e) {
        this.stopLoading();
        throw new SDKHttpError({
          status: 0,
          code: "NETWORK_ERROR",
          message: "Error inesperado en el servicio de cards",
          detail: e
        });
      }
      /* if (!res.ok) {
        throw new SDKHttpError({
          status: res.status,
          code: body?.code || "API_ERROR",
          message: body?.message || body?.description || "Error inesperado en servicio de setup",
          detail: body
        });
      } */
      return body;
    }

    async deleteCardService(cardReference) {
      const dataPayment = _dataPaymentGlobal.get(this);
      const request = {
        "clientReference" : dataPayment.apikeys.clientReference,
        "cardReference" : cardReference
      }
      let res;
      let body;
       try {
        res = await fetch(`${_url}/checkout/cards`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "cpagos-merchant-id": dataPayment.apikeys.merchantId,
            "cpagos-signature": dataPayment.signature,
            "Authorization": dataPayment.parameters.accessToken,
            "cpagos-nonce": dataPayment.apikeys.nonce,
            "cpagos-timestamp": dataPayment.timestamp,
          },
          body: JSON.stringify(request)
        });
        body = await res.json();
       } catch (e) {
        this.stopLoading();
        throw new SDKHttpError({
          status: 0,
          code: "NETWORK_ERROR",
          message: "Error inesperado en el servicio de delete cards",
          detail: e
        });
      }
      /* if (!res.ok) {
        throw new SDKHttpError({
          status: res.status,
          code: body?.code || "API_ERROR",
          message: body?.message || body?.description || "Error inesperado en servicio de setup",
          detail: body
        });
      } */
      console.log(body)
      return body;
    }

    setHeaders(){
      const dataPayment = _dataPaymentGlobal.get(this);
      return {
        "Content-Type": "application/json",
        "cpagos-merchant-id": dataPayment.apikeys.merchantId,
        "cpagos-signature": dataPayment.signature,
        "Authorization": dataPayment.parameters.accessToken,
        "cpagos-nonce": dataPayment.apikeys.nonce,
        "cpagos-timestamp": dataPayment.timestamp,
        "cpagos-information-reference": dataPayment.referenceInformationToken
      }
    }

    /* Funciones validacion de navegador */
    isMobileDevice() {
      const userAgent = navigator.userAgent || navigator.vendor || window.opera;
      return /android/i.test(userAgent) || /iPad|iPhone|iPod/.test(userAgent);
    }

    getAcceptContent() {
      if (!navigator.mimeTypes) return "";
      try {
        const mimeTypes = Array.from(navigator.mimeTypes).map(mt => mt.type);
        return mimeTypes.join(", ");
      } catch (_) {
        return "";
      }
    }
    
    getTimeDifference() {
      return new Date().getTimezoneOffset();
    }
    

  }

  class SDKHttpError extends Error {
    constructor({ status, code, message, detail }) {
      super(message);
      this.name = "CM Pagos:";
      this.status = status;
      this.code = code;
      this.detail = detail;
    }
  }

  /* Exponer SDK */
  global.CMPSDK = CMPSDK;

  /* MOCK CARD FORM */
  global.CardForm = {
    create(config) {
      const iframes = {};

      function createIframe(selector, src, styles = {}) {
        const container = document.querySelector(selector);
        const iframe = document.createElement("iframe");
        iframe.src = src;
        iframe.style.width = "100%";
        iframe.style.height = "44px";
        iframe.onload = () => {
          iframe.contentWindow.postMessage({
            type: "INIT_STYLES",
            styles
          }, "*");
        };
        container.innerHTML = "";
        container.appendChild(iframe);
        return iframe;
      }

      iframes.number = createIframe(config.fields.number.selector, "src/input/card-number.html", config.styles);
      iframes.expiration = createIframe(config.fields.expiration.selector, "src/input/expiration.html", config.styles);
      iframes.cvv = createIframe(config.fields.cvv.selector, "src/input/cvv.html", config.styles);

      return { iframes };
    }
  };

  


  /* document.addEventListener("DOMContentLoaded", async () => {
    if (!global.cmpSDKInstance) return;
    await global.cmpSDKInstance.init();
  }); */

})(window);
