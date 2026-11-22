import type { components } from "../../../types/openapi.generated";
import { api } from "../../../lib/api-client";

export type Creator = components["schemas"]["CreatorResponse"];
export type RegistrationInput = components["schemas"]["SellerRegistrationRequest"];
export type ClaimInput = components["schemas"]["SellerClaimRequest"];
export type PasswordLoginInput = components["schemas"]["PasswordLoginRequest"];
export type EmailInput = components["schemas"]["EmailRequest"];
export type TokenInput = components["schemas"]["EmailVerificationRequest"];
export type PasswordResetInput = components["schemas"]["PasswordResetRequest"];
export type AuthActionResponse = components["schemas"]["AuthActionResponse"]["data"];

export const authApi = {
  currentCreator(signal?: AbortSignal) {
    return api.get<Creator>("/v1/creator/me", { signal });
  },
  login(accessCode: string, signal?: AbortSignal) {
    return api.post<Creator>("/v1/creator/access", { accessCode }, { signal });
  },
  passwordLogin(input: PasswordLoginInput) {
    return api.post<Creator>("/v1/creator/password/login", input);
  },
  register(input: RegistrationInput) {
    return api.post<AuthActionResponse>("/v1/creator/register", input);
  },
  claim(input: ClaimInput) {
    return api.post<AuthActionResponse>("/v1/creator/claim", input);
  },
  verifyEmail(input: TokenInput) {
    return api.post<Creator>("/v1/creator/verify-email", input);
  },
  requestPasswordReset(input: EmailInput) {
    return api.post<AuthActionResponse>("/v1/creator/password/forgot", input);
  },
  resetPassword(input: PasswordResetInput) {
    return api.post<void>("/v1/creator/password/reset", input);
  },
  logout(signal?: AbortSignal) {
    return api.post<void>("/v1/creator/logout", undefined, { signal });
  },
};
