const express = require("express");
const cors = require("cors");
const pagosService = require("./services/payment.service");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//Ruta obtener token
app.post("/api/token", async (req, res) => {
  try {
    const headers = req.body;
    const tokenResponse = await pagosService.createToken(headers);
    console.log('Respuesta token',tokenResponse)
    res.json(tokenResponse);
  } catch (error) {
    res.status(500).json({
      message: "Error creando token",
      error: error.message
    });
  }
});

app.post("/api/payment", async (req, res) => {
  try {
    const body = req.body;
    const paymentResponse = await pagosService.createPayment(body);
    console.log('Respuesta service payment', paymentResponse)
    if(paymentResponse.data.result == "R"){
      res.status(500).json({
        message: "Error pago rechazado",
        error: paymentResponse.data
      });
    }else if(paymentResponse.data.result == "D"){
      if(paymentResponse.data.code == "14") {
        //? Declined Payment: Invalid Card
        res.status(500).json({
        message: "Error pago rechazado, tajerta invalida",
        error: paymentResponse.data
      });
      }
      if(paymentResponse.data.code == "51") {
        //? Declined Payment: Insufficient Founds
        res.status(500).json({
        message: "Error pago, saldo insuficiente",
        error: paymentResponse.data
      });
      }
    }else{
      res.json(paymentResponse);
    }

  } catch (error) {
    res.status(500).json({
      message: "Error procesando pago",
      error: error.message
    });
  }
});

app.get("/api/keys", async (req, res) => {
  let keys = pagosService.API_KEYS
  res.json(keys);
});

app.listen(8081, () => {
  console.log("Backend en http://localhost:8081");
});
