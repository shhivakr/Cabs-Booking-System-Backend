# TaxiCRM Backend — Phase 1–8 Master API Testing Plan

**Document Version:** 1.0.0  
**Target Release:** Pre-Frontend API Verification (Phases 1–8)  
**Author:** Antigravity (Google DeepMind Agentic Pair Programmer)  
**Date:** 2026-08-18  

---

## 1. Executive Summary

This document establishes the authoritative, end-to-end API Testing Plan for the **TaxiCRM Backend** covering all functionality delivered across **Phases 1 through 8**:
- **Phase 1:** Foundation, System Health, and Base Configuration
- **Phase 2:** Authentication, Session Management, Token Rotation, and RBAC
- **Phase 3:** Customer Management and Customer Self-Service Profile
- **Phase 4:** Driver Management, Vehicle Management, Vehicle Maintenance Records, and Driver-Vehicle Assignment
- **Phase 5:** Booking Management, Dispatch Actions (Assign Driver & Vehicle), Status Machine, and Booking Cancellations
- **Phase 6:** Payment Management, Double-Entry Ledger Invariants, and Pessimistic Concurrency
- **Phase 7:** Operational Dashboards, Business-Timezone Aggregations, Management Reports, and Formula-Escaped CSV Streaming
- **Phase 8:** Scheduling Conflict Engine, Calendar View, and Multi-Booking Operational State Machine

The purpose of this testing plan is to systematically verify every endpoint, role permission, validation constraint, financial invariant, concurrency lock, and cross-phase workflow before initiating frontend development.

---

## 2. Complete API Inventory

Below is the verified inventory of all **53 API endpoints** extracted directly from the route registrations in `src/app.ts` and `src/routes/*.routes.ts`.

### 2.1 System & Foundation (Phase 1)
| Endpoint | Method | Path | Controller | Service | Auth? | Allowed Roles | Request Body / Params | Validation Rules | Success / Error Responses | Business Rules |
|---|---|---|---|---|---|---|---|---|---|---|
| **SYS-01** | `GET` | `/health` | Inline (`app.ts`) | N/A | No | Public / All | None | None | `200 OK`<br>`{ status: 'ok', message: '...' }` | Returns server operational status. |

---

### 2.2 Authentication & Token Lifecycle (Phase 2)
| Endpoint | Method | Path | Controller | Service | Auth? | Allowed Roles | Request Body / Params | Validation Rules | Success / Error Responses | Business Rules |
|---|---|---|---|---|---|---|---|---|---|---|
| **AUTH-01** | `POST` | `/api/v1/auth/login` | `login` | `auth.service.ts` | No | Public | `{ email, password }` | `email` (valid format), `password` (min 1 char) | `200 OK`<br>`401 Unauthorized`<br>`400 Bad Request` | Verifies password hash; checks `status == ACTIVE` & `deletedAt == null`; generates JWT access token and opaque refresh token; updates `lastLoginAt`. |
| **AUTH-02** | `POST` | `/api/v1/auth/refresh` | `refresh` | `auth.service.ts` | No | Public | `{ refreshToken }` | `refreshToken` (min 1 char) | `200 OK`<br>`401 Unauthorized`<br>`400 Bad Request` | Rotates opaque refresh token atomically in a transaction. Revokes old token; rejects if expired or previously revoked (token reuse detection); issues new access + refresh tokens. |
| **AUTH-03** | `POST` | `/api/v1/auth/logout` | `logout` | `auth.service.ts` | Yes | All Authenticated Roles | `{ refreshToken }` | `refreshToken` (min 1 char) | `200 OK`<br>`401 Unauthorized`<br>`400 Bad Request` | Marks the specific refresh token as revoked (`revokedAt = now()`) for the calling user. |
| **AUTH-04** | `GET` | `/api/v1/auth/me` | `getMe` | `auth.service.ts` | Yes | All Authenticated Roles | None | JWT Bearer token in `Authorization` header | `200 OK`<br>`401 Unauthorized` | Returns current user profile (id, name, email, phone, role, status, lastLoginAt). Fails if user is inactive or deleted. |

---

### 2.3 Customers (Phase 3)
| Endpoint | Method | Path | Controller | Service | Auth? | Allowed Roles | Request Body / Params | Validation Rules | Success / Error Responses | Business Rules |
|---|---|---|---|---|---|---|---|---|---|---|
| **CUST-01** | `GET` | `/api/v1/customers/me/profile` | `getMyProfile` | `customer.service.ts` | Yes | `CUSTOMER` | None | JWT Bearer token | `200 OK`<br>`400/404 Not Found`<br>`403 Forbidden` | Resolves customer linked to `req.user.id`. Excludes soft-deleted profiles. |
| **CUST-02** | `PATCH` | `/api/v1/customers/me/profile` | `updateMyProfile` | `customer.service.ts` | Yes | `CUSTOMER` | `{ name?, phone?, address?, city?, preferredContactMethod? }` | `name` (min 2), `phone` (min 10) | `200 OK`<br>`400 Bad Request`<br>`404 Not Found` | Customer self-update. Unique phone enforcement across other customers. |
| **CUST-03** | `GET` | `/api/v1/customers` | `listCustomers` | `customer.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT` | Query: `page`, `limit`, `search`, `type`, `status` | `page` (min 1), `limit` (1-100), `type` (RETAIL, CORPORATE), `status` (ACTIVE, INACTIVE) | `200 OK`<br>`400 Bad Request` | Lists non-deleted customers. Supports insensistive search on name, phone, email, code. |
| **CUST-04** | `POST` | `/api/v1/customers` | `createCustomer` | `customer.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` | `{ name, phone, email, type?, companyName?, gstin?, address, city, preferredContactMethod?, notes? }` | `name` (min 2), `phone` (min 10), `email` (valid), if `type==CORPORATE` requires `companyName` | `201 Created`<br>`400 Bad Request` | Auto-generates `customerCode` (`CUST-XXXXXX`). Enforces unique phone and unique email. Defaults to `ACTIVE`. |
| **CUST-05** | `GET` | `/api/v1/customers/:id` | `getCustomer` | `customer.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT` | Param: `id` (UUID) | Valid UUID | `200 OK`<br>`400 Bad Request`<br>`404 Not Found` | Retrieves single customer by ID. Excludes soft-deleted records (`deletedAt == null`). |
| **CUST-06** | `PATCH` | `/api/v1/customers/:id` | `updateCustomer` | `customer.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` | Param: `id` (UUID), Body: `updateCustomerSchema` | Partial customer fields + `status` (ACTIVE, INACTIVE) | `200 OK`<br>`400 Bad Request`<br>`404 Not Found` | Validates duplicate phone/email excluding current ID. Updates non-deleted customer. |
| **CUST-07** | `DELETE` | `/api/v1/customers/:id` | `deleteCustomer` | `customer.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN` | Param: `id` (UUID) | Valid UUID | `204 No Content`<br>`400 Bad Request`<br>`404 Not Found` | Soft-deletes customer (`deletedAt = now()`). Retains historical booking references. |

---

### 2.4 Drivers & Vehicles (Phase 4)
| Endpoint | Method | Path | Controller | Service | Auth? | Allowed Roles | Request Body / Params | Validation Rules | Success / Error Responses | Business Rules |
|---|---|---|---|---|---|---|---|---|---|---|
| **DRV-01** | `GET` | `/api/v1/drivers` | `listDrivers` | `driver.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT` | Query: `page`, `limit`, `search`, `status`, `licenseType` | `page` (min 1), `limit` (1-100), `status` (enum), `licenseType` (enum) | `200 OK`<br>`400 Bad Request` | Lists non-deleted drivers with pagination and search across name, phone, code, license. |
| **DRV-02** | `POST` | `/api/v1/drivers` | `createDriver` | `driver.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN` | `{ name, phone, email?, address, dob, licenseNumber, licenseType, licenseExpiry, joiningDate, emergencyContactName?, emergencyContactPhone?, experience? }` | `dob` in past, `licenseExpiry` in future, valid enums | `201 Created`<br>`400 Bad Request` | Auto-generates `driverCode` (`DRV-XXXXXX`). Enforces unique phone & license. Status set to `AVAILABLE`. |
| **DRV-03** | `GET` | `/api/v1/drivers/:id` | `getDriver` | `driver.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT` | Param: `id` (UUID) | UUID validation | `200 OK`<br>`400 Bad Request`<br>`404 Not Found` | Retrieves driver with `assignedVehicle` relation. |
| **DRV-04** | `PATCH` | `/api/v1/drivers/:id` | `updateDriver` | `driver.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` | Param: `id` (UUID), Body: `updateDriverSchema` | Partial driver fields + `status` | `200 OK`<br>`400 Bad Request`<br>`404 Not Found` | Validates unique phone and licenseNumber if modified. |
| **DRV-05** | `DELETE` | `/api/v1/drivers/:id` | `deleteDriver` | `driver.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN` | Param: `id` (UUID) | UUID validation | `204 No Content`<br>`400 Bad Request`<br>`404 Not Found` | Soft-deletes driver (`deletedAt = now()`, `status = INACTIVE`). Fails with `400` if `ASSIGNED` or `ON_TRIP`. |
| **VEH-01** | `GET` | `/api/v1/vehicles` | `listVehicles` | `vehicle.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT` | Query: `page`, `limit`, `search`, `status`, `category` | `page` (min 1), `limit` (max 100), `status`, `category` | `200 OK`<br>`400 Bad Request` | Lists non-deleted vehicles with `assignedDriver` included. |
| **VEH-02** | `POST` | `/api/v1/vehicles` | `createVehicle` | `vehicle.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN` | `{ plateNumber, model, category, year, seats, luggageCapacity, hasAc?, fuelType, color, fitnessExpiry, insuranceExpiry, permitExpiry, pucExpiry }` | `year` (1990 to next year), valid compliance dates | `201 Created`<br>`400 Bad Request` | Auto-generates `vehicleCode` (`VH-XXXXXX`). Enforces unique plateNumber. Status set to `AVAILABLE`. |
| **VEH-03** | `GET` | `/api/v1/vehicles/:id` | `getVehicle` | `vehicle.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT` | Param: `id` (UUID) | UUID validation | `200 OK`<br>`400 Bad Request`<br>`404 Not Found` | Retrieves vehicle details, assignedDriver, and top 5 recent maintenance records. |
| **VEH-04** | `PATCH` | `/api/v1/vehicles/:id` | `updateVehicle` | `vehicle.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` | Param: `id` (UUID), Body: `updateVehicleSchema` | Partial vehicle fields + `status` | `200 OK`<br>`400 Bad Request`<br>`404 Not Found` | Updates vehicle attributes and compliance dates. Enforces plate uniqueness. |
| **VEH-05** | `DELETE` | `/api/v1/vehicles/:id` | `deleteVehicle` | `vehicle.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN` | Param: `id` (UUID) | UUID validation | `204 No Content`<br>`400 Bad Request`<br>`404 Not Found` | Soft-deletes vehicle (`deletedAt = now()`, `status = INACTIVE`). Fails with `400` if `ASSIGNED` or `ON_TRIP`. |
| **VEH-06** | `PATCH` | `/api/v1/vehicles/:id/assign` | `assignDriver` | `vehicle.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` | Param: `id` (UUID), Body: `{ driverId: string \| null }` | `driverId` is UUID or `null` | `200 OK`<br>`400 Bad Request`<br>`404 Not Found` | Assigns or unassigns default vehicle driver. Atomic transaction updates both driver and vehicle statuses to `ASSIGNED` or `AVAILABLE`. |
| **MAIN-01** | `GET` | `/api/v1/vehicles/:vehicleId/maintenance` | `listMaintenance` | `maintenance.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT` | Param: `vehicleId` (UUID) | UUID validation | `200 OK`<br>`400 Bad Request`<br>`404 Not Found` | Retrieves all maintenance records for a vehicle ordered by `date desc`. |
| **MAIN-02** | `POST` | `/api/v1/vehicles/:vehicleId/maintenance` | `createMaintenance` | `maintenance.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN` | Param: `vehicleId`, Body: `{ date, type, cost, description, provider }` | `cost >= 0`, valid date format | `201 Created`<br>`400 Bad Request`<br>`404 Not Found` | Creates maintenance record linked to non-deleted vehicle. |
| **MAIN-03** | `GET` | `/api/v1/vehicles/:vehicleId/maintenance/:id` | `getMaintenance` | `maintenance.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT` | Params: `vehicleId`, `id` | Both UUIDs valid | `200 OK`<br>`400 Bad Request`<br>`404 Not Found` | Retrieves specific maintenance record ensuring it belongs to `vehicleId`. |
| **MAIN-04** | `PATCH` | `/api/v1/vehicles/:vehicleId/maintenance/:id` | `updateMaintenance` | `maintenance.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN` | Params: `vehicleId`, `id`, Body: `updateMaintenanceSchema` | Partial maintenance fields | `200 OK`<br>`400 Bad Request`<br>`404 Not Found` | Updates maintenance record attributes. |
| **MAIN-05** | `DELETE` | `/api/v1/vehicles/:vehicleId/maintenance/:id` | `deleteMaintenance` | `maintenance.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN` | Params: `vehicleId`, `id` | Both UUIDs valid | `204 No Content`<br>`400 Bad Request`<br>`404 Not Found` | Hard-deletes maintenance record. |

---

### 2.5 Bookings & Dispatch (Phase 5 & Phase 8)
| Endpoint | Method | Path | Controller | Service | Auth? | Allowed Roles | Request Body / Params | Validation Rules | Success / Error Responses | Business Rules |
|---|---|---|---|---|---|---|---|---|---|---|
| **BK-01** | `POST` | `/api/v1/bookings` | `createBooking` | `booking.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `CUSTOMER` | `{ customerId?, pickupLocation, dropLocation, pickupDate, pickupTime, tripType, vehicleCategory, source?, passengers?, luggage?, estimatedDistance?, estimatedDuration?, fare, advance?, paymentMethod?, specialInstructions? }` | `pickupLocation` (min 2), `dropLocation` (min 2), `pickupDate` (valid), `pickupTime` (`HH:mm`), `advance <= fare` | `201 Created`<br>`400 Bad Request` | If role is `CUSTOMER`, derives `customerId` from JWT; denormalizes customer snapshot; creates initial `TimelineEvent`; calculates `remaining = fare - advance`; status = `NEW`. |
| **BK-02** | `GET` | `/api/v1/bookings` | `getBookings` | `booking.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT`, `CUSTOMER` | Query: `page`, `limit`, `search`, `status`, `source`, `tripType`, `customerId`, `driverId`, `vehicleId`, `startDate`, `endDate` | `page` (min 1), `limit` (max 100), valid enums | `200 OK`<br>`400 Bad Request` | If role is `CUSTOMER`, strictly scoped to own `customerId`. Filterable by status, date range, driver, vehicle. |
| **BK-03** | `GET` | `/api/v1/bookings/:id` | `getBooking` | `booking.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT`, `CUSTOMER` | Param: `id` (UUID) | UUID validation | `200 OK`<br>`400 Bad Request`<br>`403 Forbidden`<br>`404 Not Found` | Includes `timelineEvents` ordered by `timestamp asc`. Enforces customer ownership (403 if accessing another customer's booking). |
| **BK-04** | `PATCH` | `/api/v1/bookings/:id` | `updateBooking` | `booking.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` | Param: `id` (UUID), Body: `updateBookingSchema` | Mutable booking fields, `advance <= fare` | `200 OK`<br>`400 Bad Request`<br>`404 Not Found` | Blocked with `400` if status is `ON_TRIP`, `COMPLETED`, or `CANCELLED`. Recalculates `remaining = fare - advance`. |
| **BK-05** | `POST` | `/api/v1/bookings/:id/assign` | `assignBooking` | `booking.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` | Param: `id` (UUID), Body: `{ driverId, vehicleId }` | Both UUIDs required | `200 OK`<br>`400 Bad Request`<br>`404 Not Found`<br>`409 Conflict` | Atomic dispatch assignment: verifies driver/vehicle are active and not in maintenance/off-duty; executes `schedulingService.validateAssignmentAvailability` (rejects exact date/time collision with `409`); updates Driver/Vehicle status to `ASSIGNED`; sets booking status to `DRIVER_ASSIGNED`; denormalizes driver & vehicle details; creates `TimelineEvent`. |
| **BK-06** | `POST` | `/api/v1/bookings/:id/status` | `transitionBookingStatus` | `booking.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` | Param: `id` (UUID), Body: `{ status }` | `status` in `BookingStatus` enum | `200 OK`<br>`400 Bad Request`<br>`404 Not Found`<br>`409 Conflict` | Strict State Machine: `NEW -> CONFIRMED -> DRIVER_ASSIGNED -> DRIVER_ARRIVED -> ON_TRIP -> COMPLETED`. `CANCELLED` handled from any active state. On `COMPLETED`: increments driver trips & earnings, increments customer trips & lifetime spend, smartly checks `getHasOtherActiveBookings` before freeing driver/vehicle. |
| **BK-07** | `POST` | `/api/v1/bookings/:id/cancel` | `cancelBooking` | `booking.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `CUSTOMER` | Param: `id` (UUID), Body: `{ cancellationReason, cancellationNotes? }` | `cancellationReason` (min 2) | `200 OK`<br>`400 Bad Request`<br>`403 Forbidden`<br>`404 Not Found`<br>`409 Conflict` | CUSTOMER can only cancel own booking. Blocked with `409` if `ON_TRIP`, `COMPLETED`, or already `CANCELLED`. Smartly restores driver/vehicle to `AVAILABLE` only if no other active upcoming bookings exist. |

---

### 2.6 Payments & Financial Ledger (Phase 6)
| Endpoint | Method | Path | Controller | Service | Auth? | Allowed Roles | Request Body / Params | Validation Rules | Success / Error Responses | Business Rules |
|---|---|---|---|---|---|---|---|---|---|---|
| **PAY-01** | `POST` | `/api/v1/bookings/:bookingId/payments` | `createPayment` | `payment.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `ACCOUNTANT` | Param: `bookingId` (UUID), Body: `{ amount, method, referenceNumber?, notes?, paymentDate }` | `amount` > 0 decimal string, `paymentDate` (`YYYY-MM-DD`), valid `PaymentMethod` | `201 Created`<br>`400 Bad Request`<br>`404 Not Found` | Pessimistic locking (`FOR UPDATE`) on booking. Rejects payments on `CANCELLED` bookings. Computes `totalPaidSoFar` from `Payment` ledger (`status == PAID`). Rejects overpayment (`amount > remaining`). Generates `PAY-2026-XXXXX`. Recalculates `remaining` and derives `paymentStatus` (PENDING, PARTIAL, PAID). Creates `TimelineEvent`. |
| **PAY-02** | `GET` | `/api/v1/bookings/:bookingId/payments` | `getPaymentsForBooking` | `payment.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `ACCOUNTANT`, `DISPATCHER`, `CUSTOMER` | Param: `bookingId` (UUID), Query: `page`, `limit`, `method`, `status` | `page` (min 1), `limit` (max 100) | `200 OK`<br>`400 Bad Request`<br>`403 Forbidden`<br>`404 Not Found` | Lists all payments for a booking. Customer isolation enforced. |
| **PAY-03** | `GET` | `/api/v1/payments/:id` | `getPayment` | `payment.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `ACCOUNTANT`, `DISPATCHER`, `CUSTOMER` | Param: `id` (UUID) | UUID validation | `200 OK`<br>`400 Bad Request`<br>`403 Forbidden`<br>`404 Not Found` | Retrieves payment by ID with linked booking summary. Customer isolation enforced. |

---

### 2.7 Dashboards & Reports (Phase 7)
| Endpoint | Method | Path | Controller | Service | Auth? | Allowed Roles | Request Body / Params | Validation Rules | Success / Error Responses | Business Rules |
|---|---|---|---|---|---|---|---|---|---|---|
| **DASH-01** | `GET` | `/api/v1/dashboard/stats` | `getStats` | `dashboard.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT` | Query: `dateRange`, `from`, `to` | `dateRangeQuerySchema` | `200 OK`<br>`400 Bad Request` | Aggregates booking counts, `tripValue` (sum of non-cancelled fares), and `collectedRevenue` (sum of `PAID` payments in `paymentDate` range). |
| **DASH-02** | `GET` | `/api/v1/dashboard/revenue` | `getRevenue` | `dashboard.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT` | Query: `dateRange`, `from`, `to` | `dateRangeQuerySchema` | `200 OK`<br>`400 Bad Request` | Daily breakdown merging `pickupDate` trip values and `paymentDate` collected revenue. |
| **DASH-03** | `GET` | `/api/v1/dashboard/status-breakdown` | `getStatusBreakdown` | `dashboard.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT` | Query: `dateRange`, `from`, `to` | `dateRangeQuerySchema` | `200 OK`<br>`400 Bad Request` | Group-by count of bookings by `BookingStatus`. |
| **DASH-04** | `GET` | `/api/v1/dashboard/unassigned` | `getUnassignedBookings` | `dashboard.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT` | Query: `page`, `limit` | `page` (min 1), `limit` (max 100) | `200 OK` | Paginated bookings in `NEW` or `CONFIRMED` status with `driverId == null`. |
| **DASH-05** | `GET` | `/api/v1/dashboard/upcoming-trips` | `getUpcomingTrips` | `dashboard.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT` | Query: `page`, `limit` | `page` (min 1), `limit` (max 100) | `200 OK` | Active trips (`notIn: ['COMPLETED', 'CANCELLED']`) with `pickupDate >= today`. |
| **DASH-06** | `GET` | `/api/v1/dashboard/fleet-summary` | `getFleetSummary` | `dashboard.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT` | None | None | `200 OK` | Count of vehicles grouped by `VehicleStatus`. |
| **DASH-07** | `GET` | `/api/v1/dashboard/driver-summary` | `getDriverSummary` | `dashboard.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT` | None | None | `200 OK` | Count of drivers grouped by `DriverStatus`. |
| **REP-01** | `GET` | `/api/v1/reports/revenue` | `getRevenueReport` | `report.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `ACCOUNTANT` | Query: `dateRange`, `from`, `to` | `dateRangeQuerySchema` | `200 OK`<br>`400 Bad Request` | Detailed financial reconciliation: `tripValue`, `collectedRevenue`, `outstandingBalance`, `tripCount`. |
| **REP-02** | `GET` | `/api/v1/reports/routes` | `getRoutesReport` | `report.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `ACCOUNTANT` | Query: `dateRange`, `from`, `to`, `page`, `limit` | `dateRangeQuerySchema`, `page`, `limit` | `200 OK`<br>`400 Bad Request` | Aggregated route performance (`pickupLocation -> dropLocation`), bookingCount, totalFare, averageFare. |
| **REP-03** | `GET` | `/api/v1/reports/drivers` | `getDriversReport` | `report.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN` | Query: `dateRange`, `from`, `to`, `page`, `limit` | `dateRangeQuerySchema`, `page`, `limit` | `200 OK`<br>`400 Bad Request` | Driver metrics: assignedTrips, completedTrips, cancelledTrips, totalFareHandled, averageFare. |
| **REP-04** | `GET` | `/api/v1/reports/vehicles` | `getVehiclesReport` | `report.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN` | Query: `dateRange`, `from`, `to`, `page`, `limit` | `dateRangeQuerySchema`, `page`, `limit` | `200 OK`<br>`400 Bad Request` | Vehicle metrics: assignedTrips, completedTrips, fareHandled, utilizationMetric. |
| **REP-05** | `GET` | `/api/v1/reports/cancellations` | `getCancellationsReport` | `report.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN` | Query: `dateRange`, `from`, `to` | `dateRangeQuerySchema` | `200 OK`<br>`400 Bad Request` | Cancellation totals and breakdown grouped by `cancellationReason`. |
| **REP-06** | `GET` | `/api/v1/reports/payments` | `getPaymentsReport` | `report.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `ACCOUNTANT` | Query: `dateRange`, `from`, `to` | `dateRangeQuerySchema` | `200 OK`<br>`400 Bad Request` | Payment collection totals grouped by `PaymentMethod`. |
| **REP-07** | `GET` | `/api/v1/reports/export` | `exportReportCsv` | `report.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `ACCOUNTANT` | Query: `type`, `dateRange`, `from`, `to` | `type` in `[revenue, routes, drivers, vehicles, cancellations, payments]` | `200 OK` (CSV Stream)<br>`400 Bad Request` | Streams CSV output in chunks (batch size 100). Implements CSV injection protection (`'`, `"` escaping, formula neutralization for `=`, `+`, `-`, `@`). |

---

### 2.8 Calendar & Scheduling (Phase 8)
| Endpoint | Method | Path | Controller | Service | Auth? | Allowed Roles | Request Body / Params | Validation Rules | Success / Error Responses | Business Rules |
|---|---|---|---|---|---|---|---|---|---|---|
| **CAL-01** | `GET` | `/api/v1/calendar` | `getCalendar` | `calendar.service.ts` | Yes | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `CUSTOMER` | Query: `dateRange`, `from`, `to`, `driverId`, `vehicleId`, `status`, `page`, `limit` | `calendarQuerySchema` | `200 OK`<br>`400 Bad Request` | Read-only calendar query ordered by `pickupDate asc`, `pickupTime asc`. Customer isolation enforced. |

---

## 3. Role-Based Access Control (RBAC) Matrix

The backend enforces role-based access control via `authenticate` and `authorize(...roles)` middlewares. The matrix below defines the expected HTTP status code for each role across all 53 endpoints:
- `200` / `201` / `204`: Authorized access (Success)
- `403`: Forbidden (Authenticated with insufficient role privileges or attempting customer cross-tenant access)
- `401`: Unauthorized (Missing, expired, or invalid Bearer JWT)

| # | Endpoint & Method | Unauth | SUPER_ADMIN | ADMIN | DISPATCHER | ACCOUNTANT | CUSTOMER |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | `GET /health` | 200 | 200 | 200 | 200 | 200 | 200 |
| 2 | `POST /api/v1/auth/login` | 200 | 200 | 200 | 200 | 200 | 200 |
| 3 | `POST /api/v1/auth/refresh` | 200 | 200 | 200 | 200 | 200 | 200 |
| 4 | `POST /api/v1/auth/logout` | 401 | 200 | 200 | 200 | 200 | 200 |
| 5 | `GET /api/v1/auth/me` | 401 | 200 | 200 | 200 | 200 | 200 |
| 6 | `GET /api/v1/customers/me/profile` | 401 | 403 | 403 | 403 | 403 | 200 (Own) |
| 7 | `PATCH /api/v1/customers/me/profile` | 401 | 403 | 403 | 403 | 403 | 200 (Own) |
| 8 | `GET /api/v1/customers` | 401 | 200 | 200 | 200 | 200 | 403 |
| 9 | `POST /api/v1/customers` | 401 | 201 | 201 | 201 | 403 | 403 |
| 10 | `GET /api/v1/customers/:id` | 401 | 200 | 200 | 200 | 200 | 403 |
| 11 | `PATCH /api/v1/customers/:id` | 401 | 200 | 200 | 200 | 403 | 403 |
| 12 | `DELETE /api/v1/customers/:id` | 401 | 204 | 204 | 403 | 403 | 403 |
| 13 | `GET /api/v1/drivers` | 401 | 200 | 200 | 200 | 200 | 403 |
| 14 | `POST /api/v1/drivers` | 401 | 201 | 201 | 403 | 403 | 403 |
| 15 | `GET /api/v1/drivers/:id` | 401 | 200 | 200 | 200 | 200 | 403 |
| 16 | `PATCH /api/v1/drivers/:id` | 401 | 200 | 200 | 200 | 403 | 403 |
| 17 | `DELETE /api/v1/drivers/:id` | 401 | 204 | 204 | 403 | 403 | 403 |
| 18 | `GET /api/v1/vehicles` | 401 | 200 | 200 | 200 | 200 | 403 |
| 19 | `POST /api/v1/vehicles` | 401 | 201 | 201 | 403 | 403 | 403 |
| 20 | `GET /api/v1/vehicles/:id` | 401 | 200 | 200 | 200 | 200 | 403 |
| 21 | `PATCH /api/v1/vehicles/:id` | 401 | 200 | 200 | 200 | 403 | 403 |
| 22 | `DELETE /api/v1/vehicles/:id` | 401 | 204 | 204 | 403 | 403 | 403 |
| 23 | `PATCH /api/v1/vehicles/:id/assign` | 401 | 200 | 200 | 200 | 403 | 403 |
| 24 | `GET /api/v1/vehicles/:vehicleId/maintenance` | 401 | 200 | 200 | 200 | 200 | 403 |
| 25 | `POST /api/v1/vehicles/:vehicleId/maintenance` | 401 | 201 | 201 | 403 | 403 | 403 |
| 26 | `GET /api/v1/vehicles/:vehicleId/maintenance/:id` | 401 | 200 | 200 | 200 | 200 | 403 |
| 27 | `PATCH /api/v1/vehicles/:vehicleId/maintenance/:id` | 401 | 200 | 200 | 403 | 403 | 403 |
| 28 | `DELETE /api/v1/vehicles/:vehicleId/maintenance/:id` | 401 | 204 | 204 | 403 | 403 | 403 |
| 29 | `POST /api/v1/bookings` | 401 | 201 | 201 | 201 | 403 | 201 (Own) |
| 30 | `GET /api/v1/bookings` | 401 | 200 | 200 | 200 | 200 | 200 (Own) |
| 31 | `GET /api/v1/bookings/:id` | 401 | 200 | 200 | 200 | 200 | 200 (Own) / 403 |
| 32 | `PATCH /api/v1/bookings/:id` | 401 | 200 | 200 | 200 | 403 | 403 |
| 33 | `POST /api/v1/bookings/:id/assign` | 401 | 200 | 200 | 200 | 403 | 403 |
| 34 | `POST /api/v1/bookings/:id/status` | 401 | 200 | 200 | 200 | 403 | 403 |
| 35 | `POST /api/v1/bookings/:id/cancel` | 401 | 200 | 200 | 200 | 403 | 200 (Own) / 403 |
| 36 | `POST /api/v1/bookings/:bookingId/payments` | 401 | 201 | 201 | 403 | 201 | 403 |
| 37 | `GET /api/v1/bookings/:bookingId/payments` | 401 | 200 | 200 | 200 | 200 | 200 (Own) / 403 |
| 38 | `GET /api/v1/payments/:id` | 401 | 200 | 200 | 200 | 200 | 200 (Own) / 403 |
| 39 | `GET /api/v1/dashboard/stats` | 401 | 200 | 200 | 200 | 200 | 403 |
| 40 | `GET /api/v1/dashboard/revenue` | 401 | 200 | 200 | 200 | 200 | 403 |
| 41 | `GET /api/v1/dashboard/status-breakdown` | 401 | 200 | 200 | 200 | 200 | 403 |
| 42 | `GET /api/v1/dashboard/unassigned` | 401 | 200 | 200 | 200 | 200 | 403 |
| 43 | `GET /api/v1/dashboard/upcoming-trips` | 401 | 200 | 200 | 200 | 200 | 403 |
| 44 | `GET /api/v1/dashboard/fleet-summary` | 401 | 200 | 200 | 200 | 200 | 403 |
| 45 | `GET /api/v1/dashboard/driver-summary` | 401 | 200 | 200 | 200 | 200 | 403 |
| 46 | `GET /api/v1/reports/revenue` | 401 | 200 | 200 | 403 | 200 | 403 |
| 47 | `GET /api/v1/reports/routes` | 401 | 200 | 200 | 403 | 200 | 403 |
| 48 | `GET /api/v1/reports/drivers` | 401 | 200 | 200 | 403 | 403 | 403 |
| 49 | `GET /api/v1/reports/vehicles` | 401 | 200 | 200 | 403 | 403 | 403 |
| 50 | `GET /api/v1/reports/cancellations` | 401 | 200 | 200 | 403 | 403 | 403 |
| 51 | `GET /api/v1/reports/payments` | 401 | 200 | 200 | 403 | 200 | 403 |
| 52 | `GET /api/v1/reports/export` | 401 | 200 | 200 | 403 | 200 | 403 |
| 53 | `GET /api/v1/calendar` | 401 | 200 | 200 | 200 | 403 | 200 (Own) |

---

## 4. Master Test Case Catalog

Below is the comprehensive catalog of executable test cases categorized by Phase. Every test case specifies precondition, role, request payload, expected status, response validation, database assertion, and priority (`P0`, `P1`, `P2`, `P3`).

### 4.1 Phase 1 — Foundation & Health Tests
- **API-001** [P0] `GET /health` | Health check returns 200 and operational status message.
- **API-002** [P2] `GET /invalid-route-xyz` | Undefined routes trigger global 404 handler or default express response.

### 4.2 Phase 2 — Authentication, Tokens, and Session Lifecycle Tests
- **API-003** [P0] `POST /api/v1/auth/login` | Valid credentials return 200, JWT access token, opaque refresh token, and user profile; updates `lastLoginAt`.
- **API-004** [P0] `POST /api/v1/auth/login` | Invalid password returns 401 Unauthorized (`Invalid email or password`).
- **API-005** [P0] `POST /api/v1/auth/login` | Non-existent email returns 401 Unauthorized (`Invalid email or password`).
- **API-006** [P1] `POST /api/v1/auth/login` | User with status `INACTIVE` returns 401 Unauthorized.
- **API-007** [P1] `POST /api/v1/auth/login` | Soft-deleted user (`deletedAt != null`) returns 401 Unauthorized.
- **API-008** [P2] `POST /api/v1/auth/login` | Malformed body (missing email or password) returns 400 Bad Request.
- **API-009** [P0] `POST /api/v1/auth/refresh` | Valid refresh token returns 200, new access token, and new rotated refresh token; old token record is marked `revokedAt`.
- **API-010** [P0] `POST /api/v1/auth/refresh` | Expired refresh token returns 401 Unauthorized (`Refresh token has expired`).
- **API-011** [P0] `POST /api/v1/auth/refresh` | Reusing already-revoked refresh token returns 401 Unauthorized (`Refresh token has already been revoked`).
- **API-012** [P1] `POST /api/v1/auth/refresh` | Fake/tampered refresh token hash returns 401 Unauthorized (`Invalid refresh token`).
- **API-013** [P0] `POST /api/v1/auth/logout` | Authenticated user revokes own refresh token; returns 200; subsequent refresh attempt fails with 401.
- **API-014** [P1] `POST /api/v1/auth/logout` | Unauthenticated logout request returns 401 Unauthorized.
- **API-015** [P1] `POST /api/v1/auth/logout` | Revoking another user's refresh token does not affect the other user.
- **API-016** [P0] `GET /api/v1/auth/me` | Valid Bearer token returns 200 and logged-in user profile.
- **API-017** [P0] `GET /api/v1/auth/me` | Missing `Authorization` header returns 401 Unauthorized (`Authentication required`).
- **API-018** [P0] `GET /api/v1/auth/me` | Malformed `Authorization` header (e.g. `Basic xxx` or non-JWT) returns 401.
- **API-019** [P0] `GET /api/v1/auth/me` | Expired JWT access token returns 401 (`Invalid or expired access token`).
- **API-020** [P0] `GET /api/v1/auth/me` | Tampered signature on access token returns 401.

### 4.3 Phase 3 — Customer Management Tests
- **API-021** [P0] `GET /api/v1/customers/me/profile` | Logged-in Customer retrieves own profile linked to `userId`.
- **API-022** [P0] `GET /api/v1/customers/me/profile` | Admin or Dispatcher calling customer profile returns 403 Forbidden.
- **API-023** [P1] `GET /api/v1/customers/me/profile` | Customer user without linked customer record returns 400/404 (`Customer profile not found`).
- **API-024** [P0] `PATCH /api/v1/customers/me/profile` | Customer updates own address, city, phone; changes reflected in database.
- **API-025** [P1] `PATCH /api/v1/customers/me/profile` | Customer updating phone to an existing customer's phone returns 400 Conflict.
- **API-026** [P0] `GET /api/v1/customers` | Admin/Dispatcher/Accountant lists customers with default pagination (total, page, limit, totalPages).
- **API-027** [P0] `GET /api/v1/customers` | Customer role attempting to list all customers returns 403 Forbidden.
- **API-028** [P1] `GET /api/v1/customers?search=Patna` | Search filters matching name, phone, email, customerCode.
- **API-029** [P1] `GET /api/v1/customers?type=CORPORATE&status=ACTIVE` | Multi-filter combinations work properly.
- **API-030** [P0] `POST /api/v1/customers` | Admin/Dispatcher creates Retail customer; auto-generates `CUST-XXXXXX`, status `ACTIVE`.
- **API-031** [P0] `POST /api/v1/customers` | Creating Corporate customer without `companyName` returns 400 (`Corporate customers must have a companyName`).
- **API-032** [P0] `POST /api/v1/customers` | Creating customer with duplicate phone returns 400 (`Phone number already exists`).
- **API-033** [P0] `POST /api/v1/customers` | Creating customer with duplicate email returns 400 (`Email already exists`).
- **API-034** [P1] `POST /api/v1/customers` | Accountant or Customer role attempting customer creation returns 403 Forbidden.
- **API-035** [P0] `GET /api/v1/customers/:id` | Valid UUID returns 200 and single customer.
- **API-036** [P1] `GET /api/v1/customers/:id` | Non-existent UUID returns 404 (`Customer not found`).
- **API-037** [P2] `GET /api/v1/customers/non-uuid` | Invalid UUID format returns 400 or 404.
- **API-038** [P0] `PATCH /api/v1/customers/:id` | Admin/Dispatcher updates customer status to `INACTIVE` or modifies address.
- **API-039** [P1] `PATCH /api/v1/customers/:id` | Updating customer with duplicate email/phone belonging to another customer returns 400.
- **API-040** [P0] `DELETE /api/v1/customers/:id` | Admin soft-deletes customer (`deletedAt != null`); customer no longer appears in default list.
- **API-041** [P1] `DELETE /api/v1/customers/:id` | Dispatcher or Accountant attempting delete returns 403 Forbidden.

### 4.4 Phase 4 — Drivers, Vehicles & Maintenance Tests
- **API-042** [P0] `GET /api/v1/drivers` | Operational roles list drivers; pagination metadata returned; Customer returns 403.
- **API-043** [P1] `GET /api/v1/drivers?status=AVAILABLE&licenseType=COMMERCIAL_LMV` | Query filtering returns expected subset.
- **API-044** [P0] `POST /api/v1/drivers` | Admin creates driver; `dob` in past, `licenseExpiry` in future validated; unique code `DRV-XXXXXX` generated.
- **API-045** [P1] `POST /api/v1/drivers` | `dob` in future returns 400 (`DOB must be in the past`).
- **API-046** [P1] `POST /api/v1/drivers` | `licenseExpiry` in past returns 400 (`License expiry must be in the future`).
- **API-047** [P0] `POST /api/v1/drivers` | Duplicate driver phone or licenseNumber returns 400 Bad Request.
- **API-048** [P1] `POST /api/v1/drivers` | Dispatcher attempting driver creation returns 403 Forbidden.
- **API-049** [P0] `GET /api/v1/drivers/:id` | Returns driver profile including `assignedVehicle` relation if mapped.
- **API-050** [P1] `PATCH /api/v1/drivers/:id` | Admin/Dispatcher updates driver status to `OFF_DUTY` or modifies emergency contact.
- **API-051** [P0] `DELETE /api/v1/drivers/:id` | Soft-deletes `AVAILABLE` driver (`deletedAt != null`, `status = INACTIVE`).
- **API-052** [P0] `DELETE /api/v1/drivers/:id` | Attempting delete on driver in `ASSIGNED` or `ON_TRIP` status returns 400 (`Cannot delete driver while assigned or on trip`).
- **API-053** [P0] `GET /api/v1/vehicles` | Operational roles list vehicles including `assignedDriver`.
- **API-054** [P0] `POST /api/v1/vehicles` | Admin creates vehicle; compliance dates (`fitnessExpiry`, `insuranceExpiry`, `permitExpiry`, `pucExpiry`) parsed; `VH-XXXXXX` generated.
- **API-055** [P0] `POST /api/v1/vehicles` | Duplicate plateNumber returns 400 Bad Request.
- **API-056** [P1] `POST /api/v1/vehicles` | Year < 1990 or > next year returns 400.
- **API-057** [P0] `GET /api/v1/vehicles/:id` | Returns vehicle details with top 5 recent maintenance records.
- **API-058** [P1] `PATCH /api/v1/vehicles/:id` | Updates vehicle attributes; prevents duplicate plateNumber on collision.
- **API-059** [P0] `DELETE /api/v1/vehicles/:id` | Soft-deletes `AVAILABLE` vehicle; rejects delete on `ASSIGNED` or `ON_TRIP` with 400.
- **API-060** [P0] `PATCH /api/v1/vehicles/:id/assign` | Assigns available driver to available vehicle; atomic transaction sets both to `ASSIGNED` and sets `driver.assignedVehicleId`.
- **API-061** [P0] `PATCH /api/v1/vehicles/:id/assign` | Unassigns vehicle (`driverId = null`); resets both driver and vehicle to `AVAILABLE` and clears `assignedVehicleId`.
- **API-062** [P1] `PATCH /api/v1/vehicles/:id/assign` | Assigning driver who is already assigned to another vehicle returns 400.
- **API-063** [P1] `PATCH /api/v1/vehicles/:id/assign` | Assigning vehicle that is not in `AVAILABLE` status returns 400.
- **API-064** [P0] `GET /api/v1/vehicles/:vehicleId/maintenance` | Lists maintenance records for vehicle ordered by date descending.
- **API-065** [P0] `POST /api/v1/vehicles/:vehicleId/maintenance` | Admin records maintenance event (date, type, cost, description, provider); saved in database.
- **API-066** [P1] `POST /api/v1/vehicles/:vehicleId/maintenance` | Dispatcher/Accountant/Customer attempting maintenance creation returns 403.
- **API-067** [P0] `GET /api/v1/vehicles/:vehicleId/maintenance/:id` | Retrieves single maintenance record.
- **API-068** [P1] `PATCH /api/v1/vehicles/:vehicleId/maintenance/:id` | Admin updates maintenance cost/description.
- **API-069** [P0] `DELETE /api/v1/vehicles/:vehicleId/maintenance/:id` | Admin hard-deletes maintenance record; returns 204.

### 4.5 Phase 5 — Bookings & Dispatch Lifecycle Tests
- **API-070** [P0] `POST /api/v1/bookings` | Admin/Dispatcher creates booking for customer; calculates `remaining = fare - advance`; creates `BookingCreated` timeline event; status = `NEW`.
- **API-071** [P0] `POST /api/v1/bookings` | Customer creates own booking; system resolves `customerId` from JWT; ignores arbitrary customerId in payload.
- **API-072** [P0] `POST /api/v1/bookings` | `advance > fare` returns 400 (`Advance cannot be greater than fare`).
- **API-073** [P1] `POST /api/v1/bookings` | Invalid time format (e.g. `25:99` or `10:0`) returns 400 Bad Request.
- **API-074** [P1] `POST /api/v1/bookings` | Customer inactive or soft-deleted returns 400 (`Customer not found or inactive`).
- **API-075** [P0] `GET /api/v1/bookings` | Operational roles view all bookings; Customer role only receives own bookings.
- **API-076** [P1] `GET /api/v1/bookings?status=CONFIRMED&tripType=AIRPORT` | Filtering by status and trip type returns matching records.
- **API-077** [P1] `GET /api/v1/bookings?startDate=2026-08-01&endDate=2026-08-31` | Date filtering on `pickupDate` works accurately.
- **API-078** [P0] `GET /api/v1/bookings/:id` | Retrieves booking with complete `timelineEvents` array in chronological order.
- **API-079** [P0] `GET /api/v1/bookings/:id` | Customer attempting to fetch another customer's booking returns 403 Forbidden.
- **API-080** [P0] `PATCH /api/v1/bookings/:id` | Updates pickup location, fare, or instructions for booking in `NEW` / `CONFIRMED` / `DRIVER_ASSIGNED` / `DRIVER_ARRIVED`.
- **API-081** [P0] `PATCH /api/v1/bookings/:id` | Updating booking in `ON_TRIP`, `COMPLETED`, or `CANCELLED` status returns 400 (`Cannot update booking in ... status`).
- **API-082** [P0] `POST /api/v1/bookings/:id/assign` | Dispatcher assigns Driver & Vehicle; denormalizes details; creates timeline event; sets status `DRIVER_ASSIGNED`.
- **API-083** [P0] `POST /api/v1/bookings/:id/assign` | Driver with status `INACTIVE` or `OFF_DUTY` rejected with 400.
- **API-084** [P0] `POST /api/v1/bookings/:id/assign` | Vehicle with status `INACTIVE` or `MAINTENANCE` rejected with 400.
- **API-085** [P0] `POST /api/v1/bookings/:id/assign` | Driver already assigned to another active booking at EXACT SAME `pickupDate` and `pickupTime` rejected with 409 Conflict (`Driver is already assigned...`).
- **API-086** [P0] `POST /api/v1/bookings/:id/assign` | Vehicle already assigned to another active booking at EXACT SAME `pickupDate` and `pickupTime` rejected with 409 Conflict (`Vehicle is already assigned...`).
- **API-087** [P0] `POST /api/v1/bookings/:id/assign` | Re-assigning a different driver/vehicle releases the previous driver/vehicle safely if they have no other trips.
- **API-088** [P0] `POST /api/v1/bookings/:id/status` | Transition `NEW -> CONFIRMED` succeeds; status updated.
- **API-089** [P0] `POST /api/v1/bookings/:id/status` | Transition `CONFIRMED -> DRIVER_ASSIGNED` requires driver & vehicle assigned, else returns 409.
- **API-090** [P0] `POST /api/v1/bookings/:id/status` | Transition `DRIVER_ASSIGNED -> DRIVER_ARRIVED` succeeds.
- **API-091** [P0] `POST /api/v1/bookings/:id/status` | Transition `DRIVER_ARRIVED -> ON_TRIP` sets Driver and Vehicle status to `ON_TRIP`.
- **API-092** [P0] `POST /api/v1/bookings/:id/status` | Transition `ON_TRIP -> COMPLETED` increments driver trips & earnings, increments customer trips & lifetime spend.
- **API-093** [P0] `POST /api/v1/bookings/:id/status` | Illegal transition `NEW -> ON_TRIP` or `COMPLETED -> CONFIRMED` rejected with 409 (`Invalid status transition`).
- **API-094** [P0] `POST /api/v1/bookings/:id/cancel` | Admin/Dispatcher/Customer cancels booking; creates `Booking Cancelled` timeline event; sets status `CANCELLED`.
- **API-095** [P0] `POST /api/v1/bookings/:id/cancel` | Customer attempting to cancel another customer's booking returns 403 Forbidden.
- **API-096** [P0] `POST /api/v1/bookings/:id/cancel` | Cancelling booking in `ON_TRIP` or `COMPLETED` returns 409 (`Cannot cancel booking in ... status`).

### 4.6 Phase 6 — Payment Management & Financial Invariant Tests
- **API-097** [P0] `POST /api/v1/bookings/:bookingId/payments` | Accountant records full payment; booking `remaining = 0`, `paymentStatus = PAID`; `PAY-XXXXX` created.
- **API-098** [P0] `POST /api/v1/bookings/:bookingId/payments` | Accountant records partial payment; booking `remaining = fare - amount`, `paymentStatus = PARTIAL`.
- **API-099** [P0] `POST /api/v1/bookings/:bookingId/payments` | Overpayment attempt (`amount > remaining`) rejected with 400 (`Payment amount exceeds remaining balance`).
- **API-100** [P0] `POST /api/v1/bookings/:bookingId/payments` | Zero amount (`0`) or negative amount (`-100`) rejected with 400.
- **API-101** [P0] `POST /api/v1/bookings/:bookingId/payments` | Recording payment on `CANCELLED` booking returns 400 (`Cannot record payment on a cancelled booking`).
- **API-102** [P0] `POST /api/v1/bookings/:bookingId/payments` | Dispatcher or Customer attempting payment creation returns 403 Forbidden.
- **API-103** [P0] `POST /api/v1/bookings/:bookingId/payments` | Concurrent payments: Two simultaneous requests of ₹600 against a ₹1000 booking result in exactly one 201 (success) and one 400 (rejected overpayment) due to `FOR UPDATE` lock.
- **API-104** [P0] `GET /api/v1/bookings/:bookingId/payments` | Lists payments for booking; Customer only allowed for own booking (403 on other).
- **API-105** [P0] `GET /api/v1/payments/:id` | Retrieves single payment record with linked booking summary; Customer isolation enforced.
- **API-106** [P1] `PATCH /api/v1/payments/:id` | Verifies endpoint does NOT exist (Ledger immutability, returns 404).
- **API-107** [P1] `DELETE /api/v1/payments/:id` | Verifies endpoint does NOT exist (Ledger immutability, returns 404).

### 4.7 Phase 7 — Dashboards, Reports & CSV Export Tests
- **API-108** [P0] `GET /api/v1/dashboard/stats?dateRange=today` | Aggregates booking totals, active trips, `tripValue`, and `collectedRevenue` for today in `Asia/Kolkata`.
- **API-109** [P0] `GET /api/v1/dashboard/stats` | Verifies `collectedRevenue` only sums `Payment.amount WHERE status = PAID` and does NOT double-count `booking.advance`.
- **API-110** [P1] `GET /api/v1/dashboard/revenue?dateRange=month` | Returns daily breakdown array with `period`, `tripValue`, and `collectedRevenue`.
- **API-111** [P1] `GET /api/v1/dashboard/status-breakdown` | Returns key-value object of counts per booking status.
- **API-112** [P1] `GET /api/v1/dashboard/unassigned` | Returns paginated list of unassigned bookings (`driverId == null`, status NEW/CONFIRMED).
- **API-113** [P1] `GET /api/v1/dashboard/upcoming-trips` | Returns active upcoming trips ordered chronologically.
- **API-114** [P1] `GET /api/v1/dashboard/fleet-summary` | Returns vehicle counts grouped by `VehicleStatus`.
- **API-115** [P1] `GET /api/v1/dashboard/driver-summary` | Returns driver counts grouped by `DriverStatus`.
- **API-116** [P0] `GET /api/v1/dashboard/*` | Customer role accessing any dashboard endpoint returns 403 Forbidden.
- **API-117** [P0] `GET /api/v1/reports/revenue?dateRange=month` | Reconciles `tripValue`, `collectedRevenue`, `outstandingBalance`, and `tripCount`.
- **API-118** [P1] `GET /api/v1/reports/routes` | Returns popular routes grouped by pickup -> drop with total and average fares.
- **API-119** [P1] `GET /api/v1/reports/drivers` | Returns driver performance report; restricted to `SUPER_ADMIN, ADMIN` (Accountant & Dispatcher return 403).
- **API-120** [P1] `GET /api/v1/reports/vehicles` | Returns vehicle utilization report; restricted to `SUPER_ADMIN, ADMIN`.
- **API-121** [P1] `GET /api/v1/reports/cancellations` | Returns cancellation report grouped by reason.
- **API-122** [P1] `GET /api/v1/reports/payments` | Returns payment collections grouped by `PaymentMethod`.
- **API-123** [P0] `GET /api/v1/reports/export?type=revenue` | Streams revenue CSV; verifies `Content-Type: text/csv` and `Content-Disposition` headers.
- **API-124** [P0] `GET /api/v1/reports/export?type=cancellations` | Streams cancellations CSV containing booking code, customer, date, reason, notes, fare.
- **API-125** [P0] `GET /api/v1/reports/export` | CSV Injection Test: Data starting with `=`, `+`, `-`, `@` is prepended with `'` to prevent formula execution in spreadsheets.
- **API-126** [P1] `GET /api/v1/reports/export?type=invalid_type` | Returns 400 Bad Request (`Invalid export type`).

### 4.8 Phase 8 — Calendar & Scheduling Conflict Tests
- **API-127** [P0] `GET /api/v1/calendar?dateRange=month` | Returns chronological booking list for calendar rendering.
- **API-128** [P0] `GET /api/v1/calendar` | Customer calling calendar endpoint only sees own bookings (cross-tenant bookings filtered out).
- **API-129** [P1] `GET /api/v1/calendar?driverId=:id` | Filters calendar events by specific driver.
- **API-130** [P1] `GET /api/v1/calendar?vehicleId=:id` | Filters calendar events by specific vehicle.
- **API-131** [P0] `POST /api/v1/bookings/:id/assign` (Conflict Scenario 1) | Same Driver assigned to Booking 1 (`2026-10-01 10:00`) and Booking 2 (`2026-10-01 10:00`) -> Booking 2 rejected with 409 Conflict.
- **API-132** [P0] `POST /api/v1/bookings/:id/assign` (Conflict Scenario 2) | Same Vehicle assigned to Booking 1 (`2026-10-01 10:00`) and Booking 2 (`2026-10-01 10:00`) -> Booking 2 rejected with 409 Conflict.
- **API-133** [P0] `POST /api/v1/bookings/:id/assign` (Valid Same Day Scenario) | Same Driver assigned to Booking 1 (`2026-10-01 10:00`) and Booking 2 (`2026-10-01 15:00`) -> Allowed (200 OK).
- **API-134** [P0] `POST /api/v1/bookings/:id/assign` (Valid Different Day Scenario) | Same Driver assigned to Booking 1 (`2026-10-01 10:00`) and Booking 2 (`2026-10-02 10:00`) -> Allowed (200 OK).
- **API-135** [P0] `POST /api/v1/bookings/:id/assign` (Cancelled Booking Overlap) | Booking 1 at `10:00` is CANCELLED -> Driver can now be assigned to Booking 2 at `10:00` (200 OK).
- **API-136** [P0] Multi-Booking State Machine Regression Test | Driver A assigned to Booking 1 (Trip 1) and Booking 2 (Trip 2). Booking 1 is completed/cancelled. Driver A status remains `ASSIGNED` (NOT reset to `AVAILABLE`) because Booking 2 is still active. Once Booking 2 is completed, Driver A returns to `AVAILABLE`.

---

## 5. Security & Isolation Testing

### 5.1 Customer Isolation Scenarios
1. **Direct Profile Isolation:** Customer A calling `GET /api/v1/customers/me/profile` must receive Customer A data. Modifying Customer A phone does not alter Customer B.
2. **Booking List Isolation:** `GET /api/v1/bookings` called by Customer A returns ONLY bookings where `customerId == customerA.id`.
3. **Booking Details Isolation:** Customer A calling `GET /api/v1/bookings/:customerB_bookingId` returns `403 Forbidden` (`You do not have permission to access this booking`).
4. **Booking Cancellation Isolation:** Customer A calling `POST /api/v1/bookings/:customerB_bookingId/cancel` returns `403 Forbidden`.
5. **Payment List Isolation:** Customer A calling `GET /api/v1/bookings/:customerB_bookingId/payments` returns `403 Forbidden`.
6. **Payment Details Isolation:** Customer A calling `GET /api/v1/payments/:customerB_paymentId` returns `403 Forbidden`.
7. **Calendar Isolation:** Customer A calling `GET /api/v1/calendar` receives 0 bookings belonging to other customers.

### 5.2 Common Security Vulnerabilities
1. **SQL / ORM Injection:** Test search inputs with `' OR 1=1 --`, `"; DROP TABLE users; --` across `search`, `from`, `to`, `type`. Verify Prisma parameterization neutralizes all injection.
2. **JWT Tampering:** Alter signature bytes of token; verify immediate `401 Unauthorized`.
3. **Privilege Escalation:** Verify Customer or Dispatcher role attempting Admin routes (`DELETE /drivers/:id`, `POST /vehicles`, `GET /reports/drivers`) returns `403 Forbidden`.
4. **Information Disclosure in Errors:** Ensure invalid UUID or database constraint failures do not leak SQL stack traces, table names, or internal file paths in API responses.

---

## 6. Financial Integrity Invariants

The backend financial ledger must satisfy the following mathematical invariants:

1. **Balance Equation:**
   $$\text{Booking.remaining} = \text{Booking.fare} - \sum_{\text{status}=\text{PAID}} \text{Payment.amount}$$
2. **No Overpayment Invariant:**
   $$\sum_{\text{status}=\text{PAID}} \text{Payment.amount} \le \text{Booking.fare}$$
3. **Advance Reconciliation Invariant:**
   - When a booking is created with advance $A$ and fare $F$, `remaining` is initially $F - A$.
   - When the advance payment is formally recorded in the `payments` table with status `PAID`, `totalPaidSoFar` becomes $A$, and remaining remains $F - A$. Advance is not double-subtracted.
4. **Revenue Reconciliation:**
   - `Dashboard collectedRevenue` $\equiv$ `Report collectedRevenue` $\equiv \sum \text{Payment.amount WHERE status=PAID}$ in the specified date range.

---

## 7. Cross-Phase End-to-End Workflows

### Workflow A: Customer Self-Service to Completion
1. Customer registers / logs in via `POST /api/v1/auth/login`.
2. Customer creates booking via `POST /api/v1/bookings`. Status = `NEW`, `remaining = fare`.
3. Dispatcher views unassigned bookings via `GET /api/v1/dashboard/unassigned`.
4. Dispatcher assigns Driver & Vehicle via `POST /api/v1/bookings/:id/assign`. Status = `DRIVER_ASSIGNED`. Driver/Vehicle status = `ASSIGNED`.
5. Dispatcher transitions booking to `DRIVER_ARRIVED` and then `ON_TRIP`. Driver/Vehicle status = `ON_TRIP`.
6. Accountant records full payment via `POST /api/v1/bookings/:id/payments`. Status = `PAID`, `remaining = 0`.
7. Dispatcher transitions booking to `COMPLETED`. Driver and Vehicle return to `AVAILABLE`. Driver completed trips and earnings incremented. Customer total trips and lifetime spend incremented.

### Workflow B: Concurrent Booking Dispatch Collision
1. Dispatcher 1 and Dispatcher 2 simultaneously attempt to assign Driver 1 to two distinct bookings scheduled for `2026-10-01 10:00`.
2. Concurrency check: Exactly one request receives `200 OK`; the other receives `409 Conflict`.
3. Invariant check: Database contains exactly one assignment for Driver 1 at `2026-10-01 10:00`.

### Workflow C: Booking Cancellation with Multi-Assignment Retention
1. Driver 1 is assigned to Booking 1 (`2026-10-01 10:00`) and Booking 2 (`2026-10-01 15:00`).
2. Driver 1 status = `ASSIGNED`.
3. Customer cancels Booking 1 via `POST /api/v1/bookings/:id/cancel`.
4. System verifies Driver 1 still has active Booking 2 -> Driver 1 status remains `ASSIGNED`.
5. Dispatcher completes Booking 2 -> Driver 1 has no other active bookings -> Driver 1 status safely returns to `AVAILABLE`.

---

## 8. Performance & Controlled Load Testing

High-volume endpoints will be evaluated using controlled execution scripts to verify memory stability, query counts, and execution time:

| High-Volume Endpoint | Target Dataset Volume | Metrics Measured | Target SLA |
|---|---|---|---|
| `GET /api/v1/calendar?dateRange=month` | 1,000 to 10,000 Bookings | Response time, memory usage | $< 150\text{ ms}$ |
| `GET /api/v1/dashboard/revenue?dateRange=month` | 10,000 Bookings + 15,000 Payments | Query execution time, DB grouping efficiency | $< 250\text{ ms}$ |
| `GET /api/v1/reports/export?type=revenue` | 50,000 Payments | Stream memory footprint (batch size 100), response completion | Constant memory $< 50\text{ MB}$ |
| `POST /api/v1/bookings/:id/payments` | 50 Concurrent Requests on same Booking | Lock contention, deadlock prevention | Zero duplicate/overpayments |

---

## 9. Test Data Strategy & Environment Requirements

### 9.1 Test Database & Seeding
- **Environment:** Dedicated test PostgreSQL database configured via `DATABASE_URL` in `.env.test`.
- **Timezone:** `BUSINESS_TIMEZONE=Asia/Kolkata`.
- **Seed Fixtures:**
  - `Super Admin`: `admin@taxicrm.local` / `SuperSecretAdminPassword1!` (Role: `SUPER_ADMIN`)
  - `Admin`: `admin.ops@taxicrm.local` (Role: `ADMIN`)
  - `Dispatcher`: `dispatch@taxicrm.local` (Role: `DISPATCHER`)
  - `Accountant`: `accounts@taxicrm.local` (Role: `ACCOUNTANT`)
  - `Customer 1`: `cust1@example.com` (Role: `CUSTOMER`, linked to Customer profile 1)
  - `Customer 2`: `cust2@example.com` (Role: `CUSTOMER`, linked to Customer profile 2)
  - 12 pre-seeded Vehicles and 12 pre-seeded Drivers in varied operational states.
- **Isolation Principle:** Automated test suites execute inside transaction rollbacks or execute clean-up hooks (`deleteMany()`) per suite with `--fileParallelism false` to prevent database race conditions.

---

## 10. Postman / Newman Execution Plan

The Postman collection (`postman/TaxiCRM-Backend.postman_collection.json`) is organized into the following 10 folders matching the backend architecture:
1. `Auth` (Login, Refresh Token, Me, Logout)
2. `System` (Health Check)
3. `Customers` (List, Create, Get, Update, Delete, Get Profile, Update Profile)
4. `Drivers` (List, Create, Get, Update, Delete)
5. `Vehicles` (List, Create, Get, Update, Delete, Assign Driver)
6. `Maintenance` (List, Add, Get, Update, Delete)
7. `Bookings` (List, Create, Get, Assign, Update Status, Cancel)
8. `Payments` (Create, List Booking Payments, Get Payment)
9. `Dashboard` (Stats, Revenue, Status Breakdown, Unassigned, Upcoming Trips, Fleet Summary, Driver Summary)
10. `Reports` (Revenue, Routes, Drivers, Vehicles, Cancellations, Payments, Export CSV)
11. `Calendar` (Get Calendar)

**Automated CI Run:**
```bash
npx newman run postman/TaxiCRM-Backend.postman_collection.json \
  --environment postman/TaxiCRM-Local.postman_environment.json \
  --reporters cli,json
```

---

## 11. Traceability Matrix

| Requirement Area | API Endpoint(s) | Test Case IDs | Priority | Verification Method |
|---|---|---|:---:|---|
| System Health | `GET /health` | API-001, API-002 | P0 | Automated Vitest + Postman |
| Authentication & JWT | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` | API-003 – API-020 | P0 | Automated Vitest + Postman |
| Customer Management & Self-Service | `GET /customers`, `POST /customers`, `GET /customers/:id`, `PATCH /customers/:id`, `DELETE /customers/:id`, `GET /customers/me/profile`, `PATCH /customers/me/profile` | API-021 – API-041 | P0/P1 | Automated Vitest + Postman |
| Driver Management | `GET /drivers`, `POST /drivers`, `GET /drivers/:id`, `PATCH /drivers/:id`, `DELETE /drivers/:id` | API-042 – API-052 | P0/P1 | Automated Vitest + Postman |
| Vehicle Management & Assignment | `GET /vehicles`, `POST /vehicles`, `GET /vehicles/:id`, `PATCH /vehicles/:id`, `DELETE /vehicles/:id`, `PATCH /vehicles/:id/assign` | API-053 – API-063 | P0/P1 | Automated Vitest + Postman |
| Vehicle Maintenance Records | `GET /vehicles/:vId/maintenance`, `POST /vehicles/:vId/maintenance`, `GET /vehicles/:vId/maintenance/:id`, `PATCH /vehicles/:vId/maintenance/:id`, `DELETE /vehicles/:vId/maintenance/:id` | API-064 – API-069 | P0/P1 | Automated Vitest + Postman |
| Booking Lifecycle & Dispatch | `POST /bookings`, `GET /bookings`, `GET /bookings/:id`, `PATCH /bookings/:id`, `POST /bookings/:id/assign`, `POST /bookings/:id/status`, `POST /bookings/:id/cancel` | API-070 – API-096 | P0/P1 | Automated Vitest + Postman |
| Payment Ledger & Concurrency | `POST /bookings/:bId/payments`, `GET /bookings/:bId/payments`, `GET /payments/:id` | API-097 – API-107 | P0 | Automated Vitest + DB Invariants |
| Dashboard Aggregations | `GET /dashboard/stats`, `GET /dashboard/revenue`, `GET /dashboard/status-breakdown`, `GET /dashboard/unassigned`, `GET /dashboard/upcoming-trips`, `GET /dashboard/fleet-summary`, `GET /dashboard/driver-summary` | API-108 – API-116 | P0/P1 | Automated Vitest + Postman |
| Reports & CSV Streaming | `GET /reports/revenue`, `GET /reports/routes`, `GET /reports/drivers`, `GET /reports/vehicles`, `GET /reports/cancellations`, `GET /reports/payments`, `GET /reports/export` | API-117 – API-126 | P0/P1 | Automated Vitest + Postman |
| Calendar & Conflict Engine | `GET /calendar`, `POST /bookings/:id/assign` | API-127 – API-136 | P0 | Automated Vitest + Postman |

---

## 12. Gap Analysis & Suspected Bug Candidates

During inspection of the complete backend repository, the following observations and edge-case candidates were cataloged for review:

### BUG-CANDIDATE-001 (Decoupled User Creation on Admin Customer Creation)
- **Endpoint:** `POST /api/v1/customers`
- **Observed Behavior:** When an Admin creates a customer record, it creates a row in `Customer` with `userId = null`. There is no automatic `User` creation or password provisioning for that customer.
- **Expected Behavior:** Documented operational standard: Retail customers created via backoffice are unlinked until they complete portal registration, or `User` is provisioned separately.
- **Priority:** P2

### BUG-CANDIDATE-002 (Dispatcher Role Permissions on Reports)
- **Endpoints:** `GET /api/v1/reports/*`
- **Observed Behavior:** `DISPATCHER` role has access to `GET /api/v1/dashboard/*`, but is restricted with `403 Forbidden` on all `GET /api/v1/reports/*` endpoints.
- **Expected Behavior:** Matches Phase 7 system design specification. Dispatchers operate real-time dashboards; historical financial reports are restricted to `SUPER_ADMIN`, `ADMIN`, and `ACCOUNTANT`.
- **Priority:** P3

### BUG-CANDIDATE-003 (Postman Collection Negative Test Coverage)
- **Observed Behavior:** The Postman collection contains happy-path requests for all 53 endpoints, but lacks pre-scripted negative tests (400 validation failures, 403 unauthorized roles, 409 scheduling collisions).
- **Recommendation:** Integrate Newman test scripts asserting negative response codes and schemas.
- **Priority:** P1

---

## 13. Definition of Done for API Testing

The backend API layer across Phases 1–8 is deemed **100% verified and ready for frontend integration** when:
1. Every one of the **53 inventoried API endpoints** executes with expected status codes across all 5 roles.
2. All **P0 and P1 test cases (API-001 through API-136)** pass consistently in the automated Vitest suite.
3. Customer multi-tenant data isolation is validated with zero cross-customer data leakage across Profile, Bookings, Payments, and Calendar.
4. Pessimistic concurrency locks prevent overpayment and double-assignment under simulated race conditions.
5. All financial calculations reconcile with zero decimal drift between Booking, Payment, Dashboard, and Reports.
