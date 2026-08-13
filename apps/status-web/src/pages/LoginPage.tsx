import { useEffect, useId, useState, type FormEvent } from "react";
import {
  Button,
  Card,
  Flex,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import ColorSwitch from "@/components/ColorSwitch";
import LanguageSwitch from "@/components/Language";
import ThemeSwitch from "@/components/ThemeSwitch";
import { useAccount } from "@/contexts/AccountContext";
import { usePublicInfo } from "@/contexts/PublicInfoContext";
import { adminGet, adminPost, AdminGatewayError } from "@/lib/adminGateway";
import { readNextParam } from "@/lib/adminPaths";
import type { AuthConfigResponse, AuthResponse, SecondFactorRequiredResponse } from "@/lib/contracts";

const ERROR_KEYS: Record<string, string> = {
  github_unbound: "login.err_github_unbound",
  github_failed: "login.err_github_failed",
  github_disabled: "login.err_github_disabled",
  challenge_expired: "login.err_challenge_expired",
  invalid_second_factor: "login.err_invalid_second_factor",
  invalid_credentials: "login.err_invalid_credentials",
};

export default function LoginPage() {
  const { t } = useTranslation();
  const { account, loading, refresh } = useAccount();
  const { publicInfo } = usePublicInfo();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const fieldId = useId().replace(/:/g, "");
  const [config, setConfig] = useState<AuthConfigResponse | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [step, setStep] = useState<"credentials" | "second-factor">("credentials");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const next = readNextParam(location.search);

  useEffect(() => {
    const redirectError = searchParams.get("error");
    if (redirectError) setError(t(ERROR_KEYS[redirectError] ?? "login.err_generic", "Sign-in failed"));
    if (searchParams.get("step") === "second-factor") setStep("second-factor");
  }, [searchParams, t]);

  useEffect(() => {
    void adminGet<AuthConfigResponse>("/api/auth/config")
      .then(setConfig)
      .catch(() => setConfig({ passwordLoginEnabled: true, githubLoginEnabled: false }));
  }, []);

  if (!loading && account?.logged_in) {
    return <Navigate to={next} replace />;
  }

  const passwordLoginEnabled = config?.passwordLoginEnabled ?? !publicInfo?.disable_password_login;
  const githubLoginEnabled = config?.githubLoginEnabled ?? Boolean(publicInfo?.oauth_enable);

  const showError = (err: unknown) => {
    if (err instanceof AdminGatewayError && err.code && ERROR_KEYS[err.code]) {
      setError(t(ERROR_KEYS[err.code], err.message));
      return;
    }
    setError(err instanceof Error ? err.message : t("login.err_generic", "Sign-in failed"));
  };

  const handleCredentials = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await adminPost<AuthResponse | SecondFactorRequiredResponse>(
        "/api/auth/login",
        { email: email.trim(), password },
      );
      setPassword("");
      if ("status" in result && result.status === "second_factor_required") {
        setStep("second-factor");
        setCode("");
        return;
      }
      refresh();
      navigate(next, { replace: true });
    } catch (err) {
      showError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSecondFactor = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await adminPost<AuthResponse>("/api/auth/2fa", { code: code.trim() });
      refresh();
      navigate(next, { replace: true });
    } catch (err) {
      showError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Flex
      className="km-login-page"
      align="center"
      justify="center"
      style={{ minHeight: "100vh", padding: 24, backgroundColor: "var(--accent-1)" }}
    >
      <Card size="3" className="km-login-card" style={{ width: "min(420px, 100%)" }}>
        <Flex justify="between" align="center" mb="3">
          <Text size="5" weight="bold">
            {publicInfo?.sitename || "NodeBeacon"}
          </Text>
          <Flex gap="2">
            <ThemeSwitch />
            <ColorSwitch />
            <LanguageSwitch />
          </Flex>
        </Flex>
        <Text size="2" color="gray" mb="4">
          {t("login.desc", "Sign in to the NodeBeacon control plane.")}
        </Text>
        {error ? (
          <Text size="2" color="red" mb="3">
            {error}
          </Text>
        ) : null}
        {step === "credentials" ? (
          <form className="km-login-form" onSubmit={(event) => void handleCredentials(event)}>
            <Flex direction="column" gap="3">
              {passwordLoginEnabled ? (
                <>
                  <label>
                    <Text as="div" size="2" mb="1" weight="bold">
                      {t("login.username", "Account (email)")}
                    </Text>
                    <TextField.Root
                      id={`login-email-${fieldId}`}
                      name="email"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="owner@example.com"
                      aria-label={t("login.username", "Account (email)")}
                      required
                    />
                  </label>
                  <label>
                    <Text as="div" size="2" mb="1" weight="bold">
                      {t("login.password")}
                    </Text>
                    <TextField.Root
                      id={`login-password-${fieldId}`}
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      aria-label={t("login.password")}
                      required
                    />
                  </label>
                  <Button type="submit" disabled={submitting || !email.trim() || !password}>
                    {t("login.title")}
                  </Button>
                </>
              ) : null}
              {githubLoginEnabled ? (
                <Button
                  type="button"
                  variant={passwordLoginEnabled ? "soft" : "solid"}
                  onClick={() => {
                    window.location.assign("/api/auth/github");
                  }}
                >
                  {t("login.login_with_github")}
                </Button>
              ) : null}
            </Flex>
          </form>
        ) : (
          <form className="km-login-form" onSubmit={(event) => void handleSecondFactor(event)}>
            <Flex direction="column" gap="3">
              <label>
                <Text as="div" size="2" mb="1" weight="bold">
                  {useRecoveryCode
                    ? t("login.recovery_code", "Recovery code")
                    : t("login.two_factor")}
                </Text>
                <TextField.Root
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  aria-label={
                    useRecoveryCode
                      ? t("login.recovery_code", "Recovery code")
                      : t("login.authenticator_code", "Authenticator code")
                  }
                  autoFocus
                  required
                />
              </label>
              <Button type="submit" disabled={submitting || !code.trim()}>
                {t("login.verify", "Verify")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setUseRecoveryCode((current) => !current);
                  setCode("");
                }}
              >
                {useRecoveryCode
                  ? t("login.use_authenticator", "Use an authenticator code")
                  : t("login.use_recovery", "Use a recovery code")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  void adminPost("/api/auth/2fa/cancel").finally(() => {
                    setStep("credentials");
                    setCode("");
                  });
                }}
              >
                {t("common.back", "Back")}
              </Button>
            </Flex>
          </form>
        )}
        <Text size="1" color="gray" mt="4">
          {t("nb.login.shadowHint", "This is the NodeBeacon Admin shell. Owner sessions use the existing Fastify cookie.")}
        </Text>
      </Card>
    </Flex>
  );
}
