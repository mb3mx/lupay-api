# Fintech Reconciliation API

A production-ready fintech reconciliation system built with NestJS, Prisma ORM, and PostgreSQL.

## Features

- **Authentication**: JWT-based authentication with role-based access control
- **File Processing**: Streaming CSV and XLSX file parsing for memory efficiency
- **Transaction Filtering**: Automatic exclusion of CANCELACION and DEVOLUCION transactions
- **Reconciliation Engine**: Multi-priority matching (authorization number, transaction ID, amount + date)
- **Commission Calculation**: Configurable commission rates per client
- **Payout Generation**: Automated payout calculation with approval workflow
- **Liquidation Logic**: Card brand-specific settlement date calculations

## Project Structure

```
.
├── prisma/
│   ├── schema.prisma          # Database schema with all models
│   └── seed.ts                # Database seed script
├── src/
│   ├── main.ts                # Application entry point
│   ├── app.module.ts          # Root module
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   ├── common/
│   │   ├── decorators/
│   │   │   └── get-user.decorator.ts
│   │   ├── enums/
│   │   │   ├── card-brand.enum.ts
│   │   │   ├── file-status.enum.ts
│   │   │   ├── file-type.enum.ts
│   │   │   ├── payout-status.enum.ts
│   │   │   ├── reconciliation-priority.enum.ts
│   │   │   ├── reconciliation-status.enum.ts
│   │   │   ├── transaction-status.enum.ts
│   │   │   ├── user-role.enum.ts
│   │   │   └── index.ts
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   └── interceptors/
│   │       └── transform.interceptor.ts
│   ├── auth/
│   │   ├── dto/
│   │   │   ├── login.dto.ts
│   │   │   └── auth-response.dto.ts
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── jwt.strategy.ts
│   │   └── jwt-auth.guard.ts
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   └── users.service.ts
│   ├── clients/
│   │   ├── dto/
│   │   │   ├── create-client.dto.ts
│   │   │   └── update-client.dto.ts
│   │   ├── clients.module.ts
│   │   ├── clients.controller.ts
│   │   └── clients.service.ts
│   ├── terminals/
│   │   ├── dto/
│   │   │   ├── create-terminal.dto.ts
│   │   │   └── update-terminal.dto.ts
│   │   ├── terminals.module.ts
│   │   ├── terminals.controller.ts
│   │   └── terminals.service.ts
│   ├── files/
│   │   ├── dto/
│   │   │   └── upload-file.dto.ts
│   │   ├── parsers/
│   │   │   ├── csv-parser.ts
│   │   │   └── xlsx-parser.ts
│   │   ├── files.module.ts
│   │   ├── files.controller.ts
│   │   └── files.service.ts
│   ├── transactions/
│   │   ├── dto/
│   │   │   └── filter-transactions.dto.ts
│   │   ├── transactions.module.ts
│   │   ├── transactions.controller.ts
│   │   └── transactions.service.ts
│   ├── settlements/
│   │   ├── settlements.module.ts
│   │   ├── settlements.controller.ts
│   │   └── settlements.service.ts
│   ├── reconciliation/
│   │   ├── dto/
│   │   │   └── reconcile.dto.ts
│   │   ├── reconciliation.module.ts
│   │   ├── reconciliation.controller.ts
│   │   └── reconciliation.service.ts
│   └── payouts/
│       ├── dto/
│       │   └── generate-payout.dto.ts
│       ├── payouts.module.ts
│       ├── payouts.controller.ts
│       └── payouts.service.ts
├── package.json
├── tsconfig.json
├── nest-cli.json
└── .env.example
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 3. Setup Database

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed database
npm run db:seed
```

### 4. Start Application

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## API Documentation

Once running, Swagger documentation is available at: `http://localhost:3000/api/docs`

## Example API Requests

### Authentication

```bash
# Login as admin
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
  }'

# Response:
# {
#   "success": true,
#   "data": {
#     "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#     "user": {
#       "id": "...",
#       "email": "admin@example.com",
#       "firstName": "Admin",
#       "lastName": "User",
#       "role": "ADMIN"
#     }
#   }
# }
```

### Clients

```bash
# Get all clients (requires authentication)
curl -X GET http://localhost:3000/api/v1/clients \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Create a new client
curl -X POST http://localhost:3000/api/v1/clients \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "code": "CLI004",
    "name": "Nuevo Cliente",
    "businessName": "Nuevo Cliente SA de CV",
    "taxId": "NEW123456XYZ",
    "commissionTotal": 2.0,
    "contactName": "Contact Person",
    "contactEmail": "contact@example.com",
    "contactPhone": "+52 555 000 0000",
    "bankName": "BBVA",
    "bankAccount": "0000000000",
    "bankClabe": "000000000000000000"
  }'

# Get client by ID
curl -X GET http://localhost:3000/api/v1/clients/CLIENT_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Terminals

```bash
# Get all terminals
curl -X GET http://localhost:3000/api/v1/terminals \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Create a new terminal
curl -X POST http://localhost:3000/api/v1/terminals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "serialNumber": "TERM004001",
    "model": "Verifone Vx520",
    "clientCode": "CLI001",
    "location": "Store Front"
  }'
```

### File Upload

```bash
# Upload transactions CSV file
curl -X POST http://localhost:3000/api/v1/files/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/transactions.csv" \
  -F "fileType=TRANSACTIONS" \
  -F "clientId=CLIENT_UUID"

# Upload settlements CSV file
curl -X POST http://localhost:3000/api/v1/files/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/settlements.csv" \
  -F "fileType=SETTLEMENTS" \
  -F "clientId=CLIENT_UUID"

# Get uploaded files
curl -X GET http://localhost:3000/api/v1/files \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Transactions

```bash
# Get all transactions with filters
curl -X GET "http://localhost:3000/api/v1/transactions?clientId=CLIENT_ID&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get transactions by date range
curl -X GET "http://localhost:3000/api/v1/transactions?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get unreconciled transactions for a client
curl -X GET http://localhost:3000/api/v1/transactions/client/CLIENT_ID/unreconciled \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get transaction by ID
curl -X GET http://localhost:3000/api/v1/transactions/TRANSACTION_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Settlements

```bash
# Get all settlements
curl -X GET "http://localhost:3000/api/v1/settlements?clientId=CLIENT_ID&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get unreconciled settlements for a client
curl -X GET http://localhost:3000/api/v1/settlements/client/CLIENT_ID/unreconciled \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get settlement by ID
curl -X GET http://localhost:3000/api/v1/settlements/SETTLEMENT_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Reconciliation

```bash
# Run reconciliation for a client
curl -X POST http://localhost:3000/api/v1/reconciliation \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "clientId": "CLIENT_UUID"
  }'

# Manual reconciliation
curl -X POST http://localhost:3000/api/v1/reconciliation/manual \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "transactionId": "TRANSACTION_UUID",
    "settlementId": "SETTLEMENT_UUID",
    "notes": "Manually matched"
  }'

# Get reconciliation statistics
curl -X GET http://localhost:3000/api/v1/reconciliation/stats/CLIENT_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get all reconciliations
curl -X GET "http://localhost:3000/api/v1/reconciliation?clientId=CLIENT_ID&status=MATCHED" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Payouts

```bash
# Generate a payout
curl -X POST http://localhost:3000/api/v1/payouts/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "clientId": "CLIENT_UUID",
    "payoutDate": "2024-01-15",
    "notes": "Weekly payout"
  }'

# Get all payouts
curl -X GET "http://localhost:3000/api/v1/payouts?clientId=CLIENT_ID&status=CALCULATED" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get payout by ID
curl -X GET http://localhost:3000/api/v1/payouts/PAYOUT_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Approve a payout
curl -X PATCH http://localhost:3000/api/v1/payouts/PAYOUT_ID/approve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "paymentReference": "WIRE-2024-001"
  }'

# Mark payout as paid
curl -X PATCH http://localhost:3000/api/v1/payouts/PAYOUT_ID/pay \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get payout summary for a client
curl -X GET "http://localhost:3000/api/v1/payouts/client/CLIENT_ID/summary?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Sample CSV File Format

### Transactions CSV
```csv
transactionId,authorizationNumber,amount,fee,iva,cardBrand,cardNumber,operationType,transactionDate
TXN001,AUTH001,1000.00,25.00,4.00,VISA,4111111111111111,VENTA,2024-01-15T10:30:00
TXN002,AUTH002,500.00,12.50,2.00,MASTERCARD,5555555555554444,VENTA,2024-01-15T14:45:00
TXN003,AUTH003,2000.00,50.00,8.00,AMEX,378282246310005,VENTA,2024-01-15T22:30:00
TXN004,AUTH004,750.00,18.75,3.00,VISA,4111111111111112,CANCELACION,2024-01-15T16:00:00
```

### Settlements CSV
```csv
settlementId,authorizationNumber,amount,settledAmount,cardBrand,settlementDate,transactionDate
SET001,AUTH001,1000.00,971.00,VISA,2024-01-16,2024-01-15
SET002,AUTH002,500.00,485.50,MASTERCARD,2024-01-16,2024-01-15
SET003,AUTH003,2000.00,1942.00,AMEX,2024-01-17,2024-01-15
```

## Business Logic

### Transaction Filtering
- Automatically excludes transactions with operation types: `CANCELACION`, `DEVOLUCION`
- Excluded transactions are marked with `isExcluded=true` and stored for audit purposes

### Reconciliation Priority
1. **Authorization Number**: Exact match on authorization number
2. **Transaction ID**: Match on transaction/settlement ID
3. **Amount + Date**: Match within date range with amount tolerance (0.01)

### Liquidation Logic
- **Non-AMEX**: Before 23:00 = +1 day, After 23:00 = +2 days
- **AMEX**: Before 23:00 = +2 days, After 23:00 = +3 days

### Commission Calculation
```
clientCommission = amount * (client.commissionTotal / 100)
netToClient = amount - fee - iva - clientCommission
```

## License

MIT
