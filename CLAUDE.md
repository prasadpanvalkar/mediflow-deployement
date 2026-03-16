# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MediFlow is a pharmacy management SaaS for Indian retail pharmacies. Next.js 14 (App Router) frontend + Django 5 backend, managed as a Turbo monorepo. Currently Stage 13 of development — all screens use MOCK data (`USE_MOCK=true`).

## Development Commands

### Full Stack (Docker)
```bash
docker-compose up --build       # Start all services
docker-compose down
```

### Frontend (apps/frontend)
```bash
npm run dev          # Next.js dev server on port 3000
npm run build
npm run lint
npm run type-check   # Run this after every change
npm test
```

### Backend (apps/backend)
```bash
cd apps/backend
python manage.py migrate
python manage.py runserver      # Django dev server on port 8000
```

### Monorepo (root)
```bash
npm run dev          # All apps via Turbo
npm run build
```

## Architecture

### Monorepo
- `apps/frontend/` — Next.js 14 app (App Router)
- `apps/backend/` — Django 5 REST API (mocked for now)
- `packages/constants/` — Shared constants (GST rates, Indian states, drug schedules, staff roles)
- `packages/types/` — Shared TypeScript types

### Frontend Structure

**Routes** (`apps/frontend/app/dashboard/`):
- `billing/` — POS billing with cart, GST, print
- `inventory/` — Stock, batches, expiry
- `purchases/` — GRN, distributors, payables
- `credit/` — Udhari ledger, payments, WhatsApp
- `customers/` — Profiles, chronic patients, refills
- `staff/` — Roles, PINs, performance
- `attendance/` — Check-in/out kiosk, monthly calendar, summaries
- `reports/`, `settings/`

**State Management**:
- `store/authStore.ts` — Auth + outlet, persisted
- `store/billingStore.ts` — Cart + billing session
- `store/settingsStore.ts` — Sidebar, printer, kiosk settings, persisted

**Data layer**:
- `lib/apiClient.ts` — Exports one API object per domain; routes to mock or real
- `lib/mockApi.ts` — All mock API functions using `delay()` + in-memory data
- `mock/` — Static mock data (staff, products, customers, attendance, etc.)
- `hooks/` — `useQuery`/`useMutation` wrappers per domain

**Permissions**: `hooks/usePermissions.ts` + `<PermissionGate permission="x">`
- `super_admin` / `admin` → `manage_staff`, all permissions
- `manager` → billing, purchases, reports
- `billing_staff` → `create_bills` only

### Mock Staff (outlet-001)
| ID | Name | Role | PIN |
|----|------|------|-----|
| staff-001 | Rajesh Patil | super_admin | 0000 |
| staff-002 | Priya Sharma | admin | 1234 |
| staff-003 | Rahul Kumar | manager | 2345 |
| staff-004 | Sunita Devi | billing_staff | 4821 |
| staff-005 | Amit Singh | billing_staff | 3567 |

### Backend
- `apps/backend/mediflow/settings/` — `base.py`, `dev.py`, `prod.py`
- Only live endpoint: `GET /api/v1/health/`
- JWT auth, CORS, PostgreSQL, Celery/Redis configured but not wired to frontend yet

## Established Patterns

**Hooks** — always `useQuery` with typed `queryKey` arrays, `staleTime` set:
```typescript
export function useMyData(filter: MyFilter) {
  return useQuery({
    queryKey: ['domain', 'action', filter],
    queryFn: () => myApi.getData(filter),
    staleTime: 1000 * 60 * 5,
    enabled: !!filter.outletId,
  });
}
```

**Mock API** — `delay()` + in-memory data mutations:
```typescript
export const mockMyApi = {
  getData: async (filter: MyFilter): Promise<MyType[]> => {
    await delay(300);
    return mockData.filter(/* ... */);
  },
};
```

**Toast** — import from `hooks/use-toast`:
```typescript
const { toast } = useToast();
toast({ title: 'Done' });
toast({ variant: 'destructive', title: 'Error' });
```

**Forms** — React Hook Form + Zod + `zodResolver`

**Dates** — `date-fns` only (`format`, `addDays`, `differenceInDays`, etc.)

**Icons** — `lucide-react` only

**Styling** — Tailwind + `cn()` from `lib/utils`

**Components** — always `'use client'` at top, named exports

**Outlet ID** — use `useOutletId()` from `hooks/useOutletId.ts`

## Environment Variables

Copy `.env.example` to `.env`. Key vars:
- `NEXT_PUBLIC_USE_MOCK=true` — enables mock data
- `NEXT_PUBLIC_API_URL` — backend URL
- `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`, `DJANGO_SETTINGS_MODULE`




## Current Implementation Status
- ✅ Phase 1 Models — 15 Django models — DONE
- ✅ Phase 2 Services — 5 atomic business logic services — DONE
- ✅ Phase 3 API Endpoints — 13 endpoints, 21 total routes — DONE
- ✅ Phase 4 Tests — 84 tests, 0 failures — DONE
- ✅ Phase 5 USE_MOCK=false — Frontend live on real API — DONE
- Full plan: docs/plan.md


## Backend Architecture Rules
- All models must use OutletFilteredManager for outletId isolation
- All business logic goes in apps/backend/api/services/ (NOT in views)
- All DB mutations must be wrapped in transaction.atomic()
- Never allow batch stock to go below 0
- Schedule H/H1/X drugs MUST block sale without Doctor+Patient details

## Django App Structure
- apps/backend/api/models.py — All models
- apps/backend/api/services/ — Business logic (one file per domain)
- apps/backend/api/views/ — API views (thin, only call services)
- apps/backend/api/serializers/ — DRF serializers
- apps/backend/api/tests.py — All tests

## API Conventions
- All endpoints prefixed with /api/v1/
- JWT auth required on all endpoints except /auth/login/
- All list endpoints must support ?outletId= filter
- Response format: { data: [], meta: { total, page } }

## Implementation Order (DO NOT SKIP STEPS)
Phase 1 (Current): Models only
Phase 2: Services layer
Phase 3: API endpoints
Phase 4: Tests
Phase 5: Switch USE_MOCK=false

## Key Type Mappings
- Frontend types live in packages/types/index.ts
- Every Django model MUST map to a corresponding TypeScript type
- Never create a model field that doesn't exist in packages/types/index.ts
