
const BASE_URL = "https://api-qa.conceptopagos.com/cpagos-payment-gateway-ecm-api-endpoint-ws/rest/v1";

/* const API_KEYS = {
  clientId: 'sk_test_6651576E7A6C33374B543339325436394F506E414C4841424D587532726A526F337947544263504E347A727A38475335457364696157624A62324F4F5A6E6864_33363031393432393633',
  clientSecret: 'SlCKjjZAAOCtHCNkLjaObIQnDbGqAeM6cLpjCoXAM5SqW/20nnMg7B1ai9KlFP02',
  merchantId: '14c65ef3-5ec2-4d15-9858-f38b2c19981a',
  applicationId: 'app_test_7951506C45667156626877393531766C4D38',
  nonce: '123456789',
  clientReference: 'ba7512dd-9ad9-4b44-ac07-7e9e7da5f943'
}; */

const API_KEYS = {
  clientId: 'sk_test_416C676E4F61386B6E5844525679425674325035435239483470376A583367705366306D4D6E4461445754446232476971774A745870367463736D4857544548_33303230353631383335',
  clientSecret: 'v9NjdzsplXOkW7dMSrJzm0vc6wXGARGtSuNRHWcJ26PSB5DD0apvtD3ANXuvkRi6',
  merchantId: '06E049ECB71347',
  applicationId: 'app_test_386A72554267497752534D61524E696B3872',
  nonce: '06E049ECB71347',
  clientReference: 'ba7512dd-9ad9-4b44-ac07-7e9e7da5f943'
};

async function createToken(parameterClient) {
  const body = new URLSearchParams();

  body.append("clientId", parameterClient.clientId);
  body.append("clientSecret", API_KEYS.clientSecret);
  const res = await fetch(`${BASE_URL}/checkout/authentication/tokens`, {
    method: "POST",
    headers: {
      "cpagos-merchant-id": parameterClient.merchantId,
      "cpagos-application-id": parameterClient.applicationId,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText);
  }

  return res.json();
}

async function createPayment(paymentBody) {
  const res = await fetch(`${BASE_URL}/checkout/payments`, {
    method: "POST",
    headers: paymentBody.header,
    body: JSON.stringify(paymentBody.body)
  });
  /* const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    const error = new Error("Error en servicio de pagos");
    error.status = response.status;
    error.data = data;
    throw error;
  } */

  const data = await res.json();

  return {
    ok: res.ok,
    status: res.status,
    data
  };

}

module.exports = {
  createToken,
  createPayment,
  API_KEYS
};
