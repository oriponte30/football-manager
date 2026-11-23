export type StaffRole = 'CHIEF_SCOUT' | 'HEAD_COACH' | 'YOUTH_DIRECTOR' | 'PHYSIO';
export const STAFF_ROLES: StaffRole[] = ['HEAD_COACH', 'CHIEF_SCOUT', 'YOUTH_DIRECTOR', 'PHYSIO'];
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  CHIEF_SCOUT: 'Chief Scout',
  HEAD_COACH: 'Head Coach',
  YOUTH_DIRECTOR: 'Youth Director',
  PHYSIO: 'Physio',
};

/** Stored as 10–50 internally; displayed as 1.0★–5.0★ in 0.5★ steps. */
export type StaffPotential = number;

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  age: number;
  ability: StaffPotential;
  /** hidden ceiling */
  staffPA: StaffPotential;
  wage: number;
  clubId: string | null;
}
