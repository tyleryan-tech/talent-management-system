/**
 * 核心类型定义 — 系统所有业务实体的 TypeScript 类型
 */

export interface Employee {
  id: number
  name: string
  staffId: string
  email: string
  departmentId: number | null
  positionId: number | null
  managerId: number | null
  title: string
  rank: string
  hireDate: string
  status: 'active' | 'probation' | 'leave'
  gradSchool?: string
  careerStartDate?: string
  levelStartDate?: string
  managementPlan?: string
  orgRole?: string
  salaryBand?: string
  age?: number | null
}

export interface Department {
  id: number
  name: string
  parentId: number | null
  managerId: number | null
  hcPlan?: number
}

export interface Position {
  id: number
  name: string
  level: string
  departmentId: number
  reportingManagerId?: number | null
  quantity?: number
}

export type PerformanceGrade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'C' | 'C-'

export type ReviewStatus =
  | 'rm_pending'
  | 'in_approval'
  | 'calibration'
  | 'finalized'
  | 'communicated'
  | 'appealed'

export interface PerformanceReview {
  id: number
  employeeId: number
  cycleId: number
  reviewerId: number
  status: ReviewStatus
  proposedGrade: PerformanceGrade | ''
  finalGrade: PerformanceGrade | ''
  rmComment: string
  approvalChain: number[]
  approvalStepIndex: number
  pendingApproverId: number | null
  communicationNotes?: string
  communicationDate?: string
  appealDate?: string
  appealNote?: string
}

export interface PerformanceCycle {
  id: number
  name: string
  type: 'half_year' | 'annual'
  startDate: string
  endDate: string
  deadline?: string
  calibrationDeadline?: string
}

export interface LeaveRequest {
  id: number
  employeeId: number
  type: string
  startDate: string
  endDate: string
  status: 'pending' | 'approved' | 'rejected'
  approverId?: number
}

export interface AttendanceRecord {
  id: number
  employeeId: number
  month: string
  avgDailyHours: number
  workDays?: number
  actualWorkHours?: number
  loadRatio?: number
  loadTier?: 'under' | 'normal' | 'over'
}

export interface TalentMatrixEntry {
  employeeId: number
  performance: 'A' | 'B' | 'C'
  potential: 'H' | 'M' | 'L'
  developmentPlan?: string
}

export interface RecruitmentPipelineEntry {
  id: number
  team: string
  position: string
  candidateName: string
  stage?: string
  recruiter?: string
  source?: string
  interviewRound?: number
  score?: number
  notes?: string
}

export interface Notification {
  id: number
  employeeId: number
  title: string
  message: string
  read: boolean
  createdAt: string
}

export interface LoginUser {
  id: number
  username: string
  email: string
  role: 'hrbp' | 'manager' | 'super_admin'
  realName: string
  employeeId: number | null
  superAdmin?: boolean
  password?: string
}

export interface OrgSettings {
  productLineOwnerEmployeeId: number | null
}

export interface AttendanceRules {
  workStart: string
  workEnd: string
  monthlyStandardDays: number
  loadBandLow: number
  loadBandHigh: number
}
