import type { LoginResponse, MeResponse } from '../types/auth'
import type {
  AdminStats,
  AuthorityStats,
  AuthoritySummary,
  AuthorityUserView,
  ComplaintDetail,
  PagedComplaints,
} from '../types/complaint'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}/api${path}`, options)

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // Response had no JSON body; handled below.
  }

  if (!response.ok) {
    const message = (body as { message?: string } | null)?.message ?? `Request failed (${response.status})`
    throw new ApiError(response.status, message)
  }

  return body as T
}

interface AuthSuccess {
  success: boolean
}

async function authorizedRequest<T = AuthSuccess>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${token}`,
  }

  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  return request<T>(path, { ...init, headers })
}

export function loginRequest(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

export function fetchMe(token: string): Promise<MeResponse> {
  return request<MeResponse>('/auth/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export const adminApi = {
  listComplaints(token: string, searchParams: URLSearchParams): Promise<PagedComplaints> {
    return authorizedRequest<PagedComplaints>(`/admin/complaints?${searchParams.toString()}`, token)
  },

  getComplaint(token: string, complaintId: string): Promise<{ success: true; complaint: ComplaintDetail }> {
    return authorizedRequest(`/admin/complaints/${encodeURIComponent(complaintId)}`, token)
  },

  verifyComplaint(token: string, complaintId: string, note?: string): Promise<{ success: true; complaintId: string; status: string }> {
    return authorizedRequest(`/admin/complaints/${encodeURIComponent(complaintId)}/verify`, token, {
      method: 'PATCH',
      body: JSON.stringify({ note }),
    })
  },

  rejectComplaint(token: string, complaintId: string, note?: string): Promise<{ success: true; complaintId: string; status: string }> {
    return authorizedRequest(`/admin/complaints/${encodeURIComponent(complaintId)}/reject`, token, {
      method: 'PATCH',
      body: JSON.stringify({ note }),
    })
  },

  assignComplaint(token: string, complaintId: string, authorityId: string): Promise<{ success: true; complaintId: string; status: string }> {
    return authorizedRequest(`/admin/complaints/${encodeURIComponent(complaintId)}/assign`, token, {
      method: 'PATCH',
      body: JSON.stringify({ authorityId }),
    })
  },

  reassignComplaint(token: string, complaintId: string, authorityId: string): Promise<{ success: true; complaintId: string; status: string }> {
    return authorizedRequest(`/admin/complaints/${encodeURIComponent(complaintId)}/reassign`, token, {
      method: 'PATCH',
      body: JSON.stringify({ authorityId }),
    })
  },

  listAuthorities(token: string): Promise<{ success: true; authorities: AuthoritySummary[] }> {
    return authorizedRequest('/admin/authorities', token)
  },

  listAuthorityUsers(token: string): Promise<{ success: true; users: AuthorityUserView[] }> {
    return authorizedRequest('/admin/authority-users', token)
  },

  updateAuthorityUserAccess(
    token: string,
    userId: string,
    update: { isActive?: boolean; authorityId?: string },
  ): Promise<{ success: true; user: AuthorityUserView }> {
    return authorizedRequest(`/admin/authority-users/${encodeURIComponent(userId)}/access`, token, {
      method: 'PATCH',
      body: JSON.stringify(update),
    })
  },

  getStats(token: string): Promise<{ success: true; stats: AdminStats }> {
    return authorizedRequest('/admin/stats', token)
  },
}

export const authorityApi = {
  listComplaints(token: string, searchParams: URLSearchParams): Promise<PagedComplaints> {
    return authorizedRequest<PagedComplaints>(`/authority/complaints?${searchParams.toString()}`, token)
  },

  getComplaint(token: string, complaintId: string): Promise<{ success: true; complaint: ComplaintDetail }> {
    return authorizedRequest(`/authority/complaints/${encodeURIComponent(complaintId)}`, token)
  },

  updateStatus(token: string, complaintId: string, status: string, note?: string): Promise<{ success: true; complaintId: string; status: string }> {
    return authorizedRequest(`/authority/complaints/${encodeURIComponent(complaintId)}/status`, token, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    })
  },

  getStats(token: string): Promise<{ success: true; stats: AuthorityStats }> {
    return authorizedRequest('/authority/stats', token)
  },
}