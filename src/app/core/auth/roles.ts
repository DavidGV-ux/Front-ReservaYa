export const USER_ROLES = {
  ADMIN: 'ry_admin',
  OWNER: 'ry_owner',
  PROFESSIONAL: 'ry_professional',
  CLIENT: 'ry_client',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export function parseRole(value: string | undefined | null): UserRole | undefined {
  if (!value) return undefined;
  return Object.values(USER_ROLES).find((r) => r === value);
}