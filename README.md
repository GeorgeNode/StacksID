# StacksID: Decentralized Identity & Reputation Oracle

A comprehensive identity verification and reputation system that leverages Bitcoin's immutability through Stacks to create tamper-proof professional credentials and social reputation scores.

## Features

### 🔐 Bitcoin-Anchored Credentials

- Educational certificates, professional licenses, and skill verifications
- Immutable storage on Stacks blockchain, anchored to Bitcoin
- Cryptographic proof of authenticity and integrity

### ⭐ Reputation Mining System

- Earn reputation tokens through verified contributions
- Support for multiple reputation event types:
  - GitHub contributions (+10 points)
  - Peer reviews (+25 points)
  - Governance participation (+5 points)
  - Skill verifications (+50 points)
  - Community contributions (+15 points)
  - Education completion (+100 points)

### 🔗 Cross-Platform Integration

- RESTful API for dApps to verify credentials and reputation
- Bulk verification capabilities for multiple credentials
- Real-time reputation scoring and threshold verification

### 🛡️ Privacy-First Design

- Zero-knowledge proof compatibility for selective disclosure
- Hash-based credential storage for data privacy
- Decentralized verification without exposing sensitive data

## Smart Contract Architecture

### Core Components

1. **Identity Management**

   - Unique identity creation and management
   - Principal-to-identity mapping
   - Metadata storage with hash references

2. **Credential System**

   - Multi-type credential issuance
   - Expiration and revocation management
   - Trusted issuer network

3. **Reputation Engine**
   - Event-based reputation scoring
   - Configurable reputation weights
   - Threshold-based identity verification

## Contract Functions

### Identity Functions

- `create-identity(metadata-hash)` - Create new identity
- `update-identity-metadata(metadata-hash)` - Update identity metadata
- `get-identity(identity-id)` - Retrieve identity information
- `get-identity-by-principal(owner)` - Get identity by principal address

### Credential Functions

- `issue-credential(identity-id, type, expires-at, data-hash)` - Issue new credential
- `verify-credential(credential-id)` - Verify credential authenticity
- `revoke-credential(credential-id)` - Revoke existing credential
- `is-credential-valid(credential-id)` - Check credential validity

### Reputation Functions

- `record-reputation-event(identity-id, event-type, data-hash)` - Record reputation event
- `get-reputation-score(identity-id)` - Get current reputation score
- `verify-identity-by-reputation(identity-id)` - Verify based on reputation

### Integration APIs

- `verify-identity-api(identity-id)` - Complete identity verification response
- `bulk-verify-credentials(identity-id, credential-types)` - Bulk credential verification

## Deployment

### Prerequisites

- Stacks wallet with STX tokens
- Clarinet CLI for local development
- Node.js environment for integration testing

### Local Development

```bash
# Clone the repository
git clone <repository-url>
cd stacksid

# Install Clarinet
npm install -g @stacks/clarinet

# Check contract syntax
clarinet check

# Run tests
clarinet test

# Deploy to testnet
clarinet deploy --testnet
```

### Mainnet Deployment

```bash
# Deploy to mainnet
clarinet deploy --mainnet
```

## Usage Examples

### Creating an Identity

```clarity
;; Create identity with metadata hash
(contract-call? .stacksid create-identity "QmX7Yh9J2K3L4M5N6O7P8Q9R0S1T2U3V4W5X6Y7Z8A9B0C1D2")
```

### Issuing a Credential

```clarity
;; Issue education credential
(contract-call? .stacksid issue-credential
  u1                          ;; identity-id
  "education-degree"          ;; credential-type
  u1000000                    ;; expires-at (block height)
  "QmCredentialDataHash123"   ;; data-hash
)
```

### Recording Reputation Event

```clarity
;; Record GitHub contribution
(contract-call? .stacksid record-reputation-event
  u1                          ;; identity-id
  "github-contribution"       ;; event-type
  "QmGitHubContributionHash"  ;; data-hash
)
```

## Security Considerations

- **Trusted Issuers**: Only approved issuers can verify credentials
- **Reputation Integrity**: Event recording requires authorization
- **Credential Expiration**: Automatic validation of time-based credentials
- **Revocation System**: Immediate credential invalidation capability

## Integration Guide

### For dApp Developers

1. Use `verify-identity-api` for complete identity verification
2. Implement `bulk-verify-credentials` for multi-credential checks
3. Set appropriate reputation thresholds for your use case
4. Cache frequently accessed identity data to reduce contract calls

### For Credential Issuers

1. Apply to become a trusted issuer through governance
2. Use standardized credential types for interoperability
3. Implement proper expiration dates for time-sensitive credentials
4. Maintain off-chain metadata storage for detailed credential information

## Governance

The contract includes governance mechanisms for:

- Adding/removing trusted issuers
- Updating reputation weights
- Setting reputation thresholds
- Contract ownership transfers

## License

MIT License - See LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Support

For technical support and questions:

- Create an issue in the repository
- Join our Discord community
- Check the documentation wiki

---

**Built with ❤️ on Stacks • Secured by Bitcoin**
