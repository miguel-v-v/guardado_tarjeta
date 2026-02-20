async function createToken(setHeaders) {
  try {
    console.log(setHeaders)
    const res = await fetch("http://localhost:8081/api/token", {
      method: "POST",
      headers: {
          'Content-Type': 'application/json'
      },
      body: JSON.stringify(setHeaders)
    });
    return res.json();
  } catch (error) {
    throw new Error("Error inesperado al validar.");
  }


}

async function createPayment(requestPayment, setHeaders) {
  let request = {
    header: setHeaders,
    body: requestPayment
  }
  const res = await fetch("http://localhost:8081/api/payment", {
    method: "POST",
    headers: {
          'Content-Type': 'application/json'
      },
    body: JSON.stringify(request)
  });

  return res.json();
}

async function getKeys() {
  const res = await fetch("http://localhost:8081/api/keys", {
    method: "GET",
    headers: {
          'Content-Type': 'application/json'
      },
  });

  return res.json();
}


function showAlert({ message, type = 'info', duration = 5000 }) {
    const container = document.getElementById('alert-commerce-container');
    if (!container) return;

    const alert = document.createElement('div');
    alert.className = `alert-commerce ${type}`;
    alert.textContent = message;

    container.appendChild(alert);

    setTimeout(() => {
      alert.style.opacity = '0';
      alert.style.transform = 'translateX(120%)';
      setTimeout(() => alert.remove(), 300);
    }, duration);
  }

function loadSdk(src) {
  return new Promise((resolve, reject) => {
    if (window.CMPSDK) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar el SDK"));
    document.head.appendChild(script);
  });


  
}
