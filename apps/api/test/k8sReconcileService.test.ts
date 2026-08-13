import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { Agent } from "undici";
import { afterEach, describe, expect, it } from "vitest";
import { createKubernetesDispatcher, kubernetesPatch } from "../src/services/k8sReconcileService.js";

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDGjCCAgKgAwIBAgIUIQuJtb2jKaapd7R0Xz7wazuyOKcwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMB4XDTI2MDgxMzE2MTYzNFoXDTM2MDgx
MDE2MTYzNFowFDESMBAGA1UEAwwJMTI3LjAuMC4xMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAqCt0RV7axYYLtFnGCGQB7V2rmC4C7Gm4YdCkPZAffk7v
XhNzzkin3heaGSAEH+zwnuPY1kSHbXuZwyPGM64SwiKgUyAZRdNx1dNX1hY2iO7r
0Vfj1sRDnl2eWi/JcfN427KSH+PV0OKQ4GqAyq19nydqs+r4sfhBKG7svbs8/67l
va8f0XMBZche7O0iTDH6npBghO8WVikm+4HzbBXXdo67yeVLAm0Vml2DDS+hnW6U
UzJTu0btuGue8+0q/WkhTF1oFvHWPKYzpQv97gKc80CiNBx/OIoyXHJKBLDqzbyf
BN34P8J9YuWdLhW1gKFbbquZlOyNswj8K9gkEAldxQIDAQABo2QwYjAdBgNVHQ4E
FgQURej1g4OSkYnhSae/wvq+2lHYsrAwHwYDVR0jBBgwFoAURej1g4OSkYnhSae/
wvq+2lHYsrAwDwYDVR0TAQH/BAUwAwEB/zAPBgNVHREECDAGhwR/AAABMA0GCSqG
SIb3DQEBCwUAA4IBAQBLVpQUAYRGXHNoDq4JuPIlbG5CjnFPJOrSfq99HdVIGsNr
SW0OMssEMJHqUyzeS2AaScLQmpTsk63HEaZUaKWwCvS9raFYemV/i7w9v3s96wYj
23hcDTW0yzaPoS5dhxqLxLeOngBFmjk9fXb9QLve0/YzFjH/WauRtksOUDVBRcHk
mGEEuug1mxVS8bxGxTAa63C1eTwhr0S+Fncjn3VlmMvuoKlMdVRf+Peq7d8lgbvK
82tiO5sdGJ48WQ3UvuLkPvUc7T/WhdZUb7VKIiOwLZmSWQiz80ob/O4lMndOJSx/
bn9lSZSayzzJUGAr5eavURZwhqHWTkNQX1Vh0vHH
-----END CERTIFICATE-----
`;

const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCoK3RFXtrFhgu0
WcYIZAHtXauYLgLsabhh0KQ9kB9+Tu9eE3POSKfeF5oZIAQf7PCe49jWRIdte5nD
I8YzrhLCIqBTIBlF03HV01fWFjaI7uvRV+PWxEOeXZ5aL8lx83jbspIf49XQ4pDg
aoDKrX2fJ2qz6vix+EEobuy9uzz/ruW9rx/RcwFlyF7s7SJMMfqekGCE7xZWKSb7
gfNsFdd2jrvJ5UsCbRWaXYMNL6GdbpRTMlO7Ru24a57z7Sr9aSFMXWgW8dY8pjOl
C/3uApzzQKI0HH84ijJcckoEsOrNvJ8E3fg/wn1i5Z0uFbWAoVtuq5mU7I2zCPwr
2CQQCV3FAgMBAAECggEACd5iJULPpM32eHlyMrWntUwmnZ7jNgg7aHLfFVIuJViw
sr0cGFidw6pv6ElY/jfTcQeSIHs6CIJupgulF6aywoJX4gW2ssKZrtog3YpFKs9j
UFApKZL8tgzslejkmFOY3cLcN2BEs/+vtjOzZiSjN0h2LXCJcp9maqu29Q78h+aD
tONwne0N05pkt2f+LhzBI5lob+y2WoEaveqWI/pLvCI1YCsW7lA3tvEMpcNGzCPq
Rkpv9QrC3o85OwtX2EuL0KUKKyk5jfDVgPC5zqEeXfPyewBjciRg6/aIOmFdKM4Q
GuxEEv4tyQ7r/wNaJpURfYU/WNlNOIoD4l1Cyly4awKBgQDaiQUF8hzDQBMshp5+
e1hl7WVgOJ5PXbT0HpvBCcMnuotZWJJMx5x2x8VH8BftWI7Wf4GqM6o4+2wh+tqo
E2baewQGR5vDwb/Y6/w0+DUeuJhOR13szi4uv18TrsKCCEWKhmS0gIz+9zgjTe0a
BD4/CYJZu43TRqHtTCvyx2Og1wKBgQDFAAP9QIJwIiN8ciX7uGzWexFl6A9CZKMc
NarndHWZQPB+MeW1LNVKlo5TrNLQC5TISKZLgkdzF1HXoQ5TQF7A/ZxfIJeBAzYO
PfttK7z1bz4RoUu2QG9/+s60a84MtwGBtr4UP9I26HO9vFZMsPp5OE66MdgcQ4Qt
sBARmPu2wwKBgD+QFwvxrfgEjQ8oYLU9Pyr2b8Qa88D16ooO1RLCuia2FY35OyRl
8taBqJoR9YOtfG5bS+WrfVlxl7QSeMLmUcY+fZ8t+NppYlm/2e22PA0hd/tcuq8E
EV67fvYEoMKdkUyHZocx1NDcK1HpeotUrJ49L9LVwJyxMKwKucW1xP6lAoGBAKMm
dCdVObGsVD9IOfTStDCdE7eWDK0rs3o1aCjv5kTZ51Jb+KWnT63KKm1Z/+2U6c9F
e5OlfY7vjTRLihWghdjHMK4Hy/Fou2foJUYwpvmM+5aWQqHZk34mNPJvJeKZ3YGT
2q/iezJGKTTFuaMiHw4td+X0Scp+kAVWfrhUPoMJAoGBAM59zZN8mtF7xFpHGGSa
ySkFkBfDR4XMghLsQAuIk4AF94AVaSBosxlfxINwADF+T3yfGe8goNcWBgww/Alm
XWX9d78stcUWae6OrlK6y2bKelN/ExsXErDY/Xf74xRgx7Dp3cs2f7MoFQOdj1Yz
f+y/rFQzJoSoBoXTMyi1xGQi
-----END PRIVATE KEY-----
`;

describe("kubernetes managed-probe reconcile TLS", () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })));
  });

  it("builds an undici dispatcher that installs the service-account CA", () => {
    const dispatcher = createKubernetesDispatcher(Buffer.from(TEST_CERT));
    expect(dispatcher).toBeInstanceOf(Agent);
  });

  it("fails TLS without the CA and reaches the API once the CA is installed", async () => {
    const server = createServer({ key: TEST_KEY, cert: TEST_CERT }, (_request, response) => {
      response.writeHead(401).end();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const url = `https://127.0.0.1:${port}/apis/monitoring.coreos.com/v1/namespaces/nodebeacon/probes/nodebeacon-managed-tcp`;

    await expect(kubernetesPatch(url, "token", { spec: {} })).rejects.toThrow(/fetch failed/i);

    const withCa = await kubernetesPatch(url, "token", { spec: {} }, Buffer.from(TEST_CERT));
    expect(withCa).toEqual({ ok: false, status: 401 });
  });
});
