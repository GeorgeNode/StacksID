import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const contractOwner = accounts.get("deployer")!;
const user1 = accounts.get("wallet_1")!;
const user2 = accounts.get("wallet_2")!;
const trustedIssuer = accounts.get("wallet_3")!;
const verifier = accounts.get("wallet_4")!;

const contractName = "stacks-id";

describe("StacksID - Decentralized Identity & Reputation Oracle", () => {
  beforeEach(() => {
    simnet.mineEmptyBlocks(1);
  });

  describe("Contract Initialization", () => {
    it("should initialize with correct default values", () => {
      // Check that no identities exist initially
      const identity = simnet.callReadOnlyFn(
        contractName,
        "get-identity",
        [Cl.uint(1)],
        contractOwner
      );
      expect(identity.result).toBeNone();

      // Check that no principal has identity initially
      const identityByPrincipal = simnet.callReadOnlyFn(
        contractName,
        "get-identity-by-principal",
        [Cl.principal(user1)],
        contractOwner
      );
      expect(identityByPrincipal.result).toBeNone();

      // Check that user is not trusted issuer initially
      const isTrusted = simnet.callReadOnlyFn(
        contractName,
        "is-trusted-issuer",
        [Cl.principal(user1)],
        contractOwner
      );
      expect(isTrusted.result).toBeBool(false);
    });

    it("should return none for non-existent credential", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-credential",
        [Cl.uint(1)],
        contractOwner
      );
      expect(result).toBeNone();
    });

    it("should return false for invalid credential", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "is-credential-valid",
        [Cl.uint(1)],
        contractOwner
      );
      expect(result).toBeBool(false);
    });

    it("should return none for non-existent identity credential", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-identity-credential",
        [Cl.uint(1), Cl.stringAscii("github")],
        contractOwner
      );
      expect(result).toBeNone();
    });

    it("should return false for non-existent valid credential check", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "has-valid-credential",
        [Cl.uint(1), Cl.stringAscii("github")],
        contractOwner
      );
      expect(result).toBeBool(false);
    });
  });

  describe("Identity Management", () => {
    it("should allow creating a new identity", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("hash123456789")],
        user1
      );
      expect(result).toBeOk(Cl.uint(1));

      // Verify identity was created
      const identity = simnet.callReadOnlyFn(
        contractName,
        "get-identity",
        [Cl.uint(1)],
        user1
      );
      expect(identity.result).toBeSome(
        Cl.tuple({
          "owner": Cl.principal(user1),
          "created-at": Cl.uint(simnet.blockHeight),
          "updated-at": Cl.uint(simnet.blockHeight),
          "reputation-score": Cl.uint(0),
          "is-verified": Cl.bool(false),
          "metadata-hash": Cl.stringAscii("hash123456789")
        })
      );

      // Verify principal mapping
      const identityByPrincipal = simnet.callReadOnlyFn(
        contractName,
        "get-identity-by-principal",
        [Cl.principal(user1)],
        user1
      );
      expect(identityByPrincipal.result).toBeSome(
        Cl.tuple({
          "owner": Cl.principal(user1),
          "created-at": Cl.uint(simnet.blockHeight),
          "updated-at": Cl.uint(simnet.blockHeight),
          "reputation-score": Cl.uint(0),
          "is-verified": Cl.bool(false),
          "metadata-hash": Cl.stringAscii("hash123456789")
        })
      );
    });

    it("should prevent creating duplicate identity for same principal", () => {
      // Create first identity
      simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("hash123")],
        user1
      );

      // Try to create second identity for same principal
      const { result } = simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("hash456")],
        user1
      );
      expect(result).toBeErr(Cl.uint(402)); // ERR_IDENTITY_EXISTS
    });

    it("should allow different principals to create separate identities", () => {
      const result1 = simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("hash123")],
        user1
      );
      expect(result1.result).toBeOk(Cl.uint(1));

      const result2 = simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("hash456")],
        user2
      );
      expect(result2.result).toBeOk(Cl.uint(2));
    });

    it("should allow updating identity metadata", () => {
      // Create identity first
      simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("original-hash")],
        user1
      );

      // Update metadata
      const { result } = simnet.callPublicFn(
        contractName,
        "update-identity-metadata",
        [Cl.stringAscii("updated-hash")],
        user1
      );
      expect(result).toBeOk(Cl.bool(true));

      // Verify update
      const identity = simnet.callReadOnlyFn(
        contractName,
        "get-identity",
        [Cl.uint(1)],
        user1
      );
      expect(identity.result).toBeSome(
        Cl.tuple({
          "owner": Cl.principal(user1),
          "created-at": Cl.uint(simnet.blockHeight - 1),
          "updated-at": Cl.uint(simnet.blockHeight),
          "reputation-score": Cl.uint(0),
          "is-verified": Cl.bool(false),
          "metadata-hash": Cl.stringAscii("updated-hash")
        })
      );
    });

    it("should reject metadata update for non-existent identity", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "update-identity-metadata",
        [Cl.stringAscii("new-hash")],
        user1
      );
      expect(result).toBeErr(Cl.uint(403)); // ERR_IDENTITY_NOT_FOUND
    });
  });

  describe("Trusted Issuer Management", () => {
    it("should allow owner to add trusted issuer", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "add-trusted-issuer",
        [Cl.principal(trustedIssuer), Cl.stringAscii("government")],
        contractOwner
      );
      expect(result).toBeOk(Cl.bool(true));

      // Verify issuer is trusted
      const isTrusted = simnet.callReadOnlyFn(
        contractName,
        "is-trusted-issuer",
        [Cl.principal(trustedIssuer)],
        contractOwner
      );
      expect(isTrusted.result).toBeBool(true);
    });

    it("should not allow non-owner to add trusted issuer", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "add-trusted-issuer",
        [Cl.principal(trustedIssuer), Cl.stringAscii("government")],
        user1
      );
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("should allow owner to remove trusted issuer", () => {
      // Add issuer first
      simnet.callPublicFn(
        contractName,
        "add-trusted-issuer",
        [Cl.principal(trustedIssuer), Cl.stringAscii("government")],
        contractOwner
      );

      // Remove issuer
      const { result } = simnet.callPublicFn(
        contractName,
        "remove-trusted-issuer",
        [Cl.principal(trustedIssuer)],
        contractOwner
      );
      expect(result).toBeOk(Cl.bool(true));

      // Verify issuer is no longer trusted
      const isTrusted = simnet.callReadOnlyFn(
        contractName,
        "is-trusted-issuer",
        [Cl.principal(trustedIssuer)],
        contractOwner
      );
      expect(isTrusted.result).toBeBool(false);
    });

    it("should not allow non-owner to remove trusted issuer", () => {
      // Add issuer first
      simnet.callPublicFn(
        contractName,
        "add-trusted-issuer",
        [Cl.principal(trustedIssuer), Cl.stringAscii("government")],
        contractOwner
      );

      const { result } = simnet.callPublicFn(
        contractName,
        "remove-trusted-issuer",
        [Cl.principal(trustedIssuer)],
        user1
      );
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });
  });

  describe("Credential Management", () => {
    beforeEach(() => {
      // Create identity and add trusted issuer for credential tests
      simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("test-hash")],
        user1
      );
      
      simnet.callPublicFn(
        contractName,
        "add-trusted-issuer",
        [Cl.principal(trustedIssuer), Cl.stringAscii("government")],
        contractOwner
      );
    });

    it("should allow trusted issuer to issue credential", () => {
      const expiresAt = simnet.blockHeight + 1000;
      const { result } = simnet.callPublicFn(
        contractName,
        "issue-credential",
        [
          Cl.uint(1),
          Cl.stringAscii("github"),
          Cl.uint(expiresAt),
          Cl.stringAscii("credential-data-hash")
        ],
        trustedIssuer
      );
      expect(result).toBeOk(Cl.uint(1));

      // Verify credential was created
      const credential = simnet.callReadOnlyFn(
        contractName,
        "get-credential",
        [Cl.uint(1)],
        trustedIssuer
      );
      expect(credential.result).toBeSome(
        Cl.tuple({
          "identity-id": Cl.uint(1),
          "credential-type": Cl.stringAscii("github"),
          "issuer": Cl.principal(trustedIssuer),
          "issued-at": Cl.uint(simnet.blockHeight),
          "expires-at": Cl.uint(expiresAt),
          "is-revoked": Cl.bool(false),
          "data-hash": Cl.stringAscii("credential-data-hash"),
          "verification-status": Cl.stringAscii("pending")
        })
      );
    });

    it("should allow identity owner to issue credential for themselves", () => {
      const expiresAt = simnet.blockHeight + 1000;
      const { result } = simnet.callPublicFn(
        contractName,
        "issue-credential",
        [
          Cl.uint(1),
          Cl.stringAscii("self-cert"),
          Cl.uint(expiresAt),
          Cl.stringAscii("self-data-hash")
        ],
        user1
      );
      expect(result).toBeOk(Cl.uint(1));
    });

    it("should allow contract owner to issue credential", () => {
      const expiresAt = simnet.blockHeight + 1000;
      const { result } = simnet.callPublicFn(
        contractName,
        "issue-credential",
        [
          Cl.uint(1),
          Cl.stringAscii("admin-cert"),
          Cl.uint(expiresAt),
          Cl.stringAscii("admin-data-hash")
        ],
        contractOwner
      );
      expect(result).toBeOk(Cl.uint(1));
    });

    it("should reject credential issuance by unauthorized user", () => {
      const expiresAt = simnet.blockHeight + 1000;
      const { result } = simnet.callPublicFn(
        contractName,
        "issue-credential",
        [
          Cl.uint(1),
          Cl.stringAscii("unauthorized"),
          Cl.uint(expiresAt),
          Cl.stringAscii("data-hash")
        ],
        user2
      );
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("should reject credential with past expiration date", () => {
      const expiresAt = simnet.blockHeight - 1;
      const { result } = simnet.callPublicFn(
        contractName,
        "issue-credential",
        [
          Cl.uint(1),
          Cl.stringAscii("expired"),
          Cl.uint(expiresAt),
          Cl.stringAscii("data-hash")
        ],
        trustedIssuer
      );
      expect(result).toBeErr(Cl.uint(404)); // ERR_INVALID_CREDENTIAL
    });

    it("should reject credential for non-existent identity", () => {
      const expiresAt = simnet.blockHeight + 1000;
      const { result } = simnet.callPublicFn(
        contractName,
        "issue-credential",
        [
          Cl.uint(999),
          Cl.stringAscii("invalid"),
          Cl.uint(expiresAt),
          Cl.stringAscii("data-hash")
        ],
        trustedIssuer
      );
      expect(result).toBeErr(Cl.uint(403)); // ERR_IDENTITY_NOT_FOUND
    });

    it("should create identity-credential mapping", () => {
      const expiresAt = simnet.blockHeight + 1000;
      simnet.callPublicFn(
        contractName,
        "issue-credential",
        [
          Cl.uint(1),
          Cl.stringAscii("github"),
          Cl.uint(expiresAt),
          Cl.stringAscii("data-hash")
        ],
        trustedIssuer
      );

      // Check identity credential mapping
      const identityCredential = simnet.callReadOnlyFn(
        contractName,
        "get-identity-credential",
        [Cl.uint(1), Cl.stringAscii("github")],
        user1
      );
      expect(identityCredential.result).toBeSome(
        Cl.tuple({
          "identity-id": Cl.uint(1),
          "credential-type": Cl.stringAscii("github"),
          "issuer": Cl.principal(trustedIssuer),
          "issued-at": Cl.uint(simnet.blockHeight),
          "expires-at": Cl.uint(expiresAt),
          "is-revoked": Cl.bool(false),
          "data-hash": Cl.stringAscii("data-hash"),
          "verification-status": Cl.stringAscii("pending")
        })
      );
    });
  });

  describe("Credential Verification", () => {
    beforeEach(() => {
      // Setup for verification tests
      simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("test-hash")],
        user1
      );
      
      simnet.callPublicFn(
        contractName,
        "add-trusted-issuer",
        [Cl.principal(trustedIssuer), Cl.stringAscii("government")],
        contractOwner
      );

      // Issue a credential
      const expiresAt = simnet.blockHeight + 1000;
      simnet.callPublicFn(
        contractName,
        "issue-credential",
        [
          Cl.uint(1),
          Cl.stringAscii("github"),
          Cl.uint(expiresAt),
          Cl.stringAscii("data-hash")
        ],
        trustedIssuer
      );
    });

    it("should allow trusted issuer to verify credential", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "verify-credential",
        [Cl.uint(1)],
        trustedIssuer
      );
      expect(result).toBeOk(Cl.bool(true));

      // Check verification status updated
      const credential = simnet.callReadOnlyFn(
        contractName,
        "get-credential",
        [Cl.uint(1)],
        trustedIssuer
      );
      expect(credential.result).toBeSome(
        Cl.tuple({
          "identity-id": Cl.uint(1),
          "credential-type": Cl.stringAscii("github"),
          "issuer": Cl.principal(trustedIssuer),
          "issued-at": Cl.uint(simnet.blockHeight - 1),
          "expires-at": Cl.uint(simnet.blockHeight + 999),
          "is-revoked": Cl.bool(false),
          "data-hash": Cl.stringAscii("data-hash"),
          "verification-status": Cl.stringAscii("verified")
        })
      );
    });

    it("should allow contract owner to verify credential", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "verify-credential",
        [Cl.uint(1)],
        contractOwner
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should not allow unauthorized user to verify credential", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "verify-credential",
        [Cl.uint(1)],
        user2
      );
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("should reject verification of non-existent credential", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "verify-credential",
        [Cl.uint(999)],
        trustedIssuer
      );
      expect(result).toBeErr(Cl.uint(404)); // ERR_INVALID_CREDENTIAL
    });

    it("should reject verification of expired credential", () => {
      // Create expired credential
      const expiresAt = simnet.blockHeight + 1;
      simnet.callPublicFn(
        contractName,
        "issue-credential",
        [
          Cl.uint(1),
          Cl.stringAscii("expired-cert"),
          Cl.uint(expiresAt),
          Cl.stringAscii("data-hash")
        ],
        trustedIssuer
      );

      // Mine blocks to expire credential
      simnet.mineEmptyBlocks(2);

      const { result } = simnet.callPublicFn(
        contractName,
        "verify-credential",
        [Cl.uint(2)],
        trustedIssuer
      );
      expect(result).toBeErr(Cl.uint(405)); // ERR_CREDENTIAL_EXPIRED
    });

    it("should correctly identify valid credentials", () => {
      // Verify credential first
      simnet.callPublicFn(
        contractName,
        "verify-credential",
        [Cl.uint(1)],
        trustedIssuer
      );

      const isValid = simnet.callReadOnlyFn(
        contractName,
        "is-credential-valid",
        [Cl.uint(1)],
        user1
      );
      expect(isValid.result).toBeBool(true);

      // Check has valid credential
      const hasValid = simnet.callReadOnlyFn(
        contractName,
        "has-valid-credential",
        [Cl.uint(1), Cl.stringAscii("github")],
        user1
      );
      expect(hasValid.result).toBeBool(true);
    });

    it("should identify invalid credentials correctly", () => {
      // Unverified credential should be invalid
      const isValid = simnet.callReadOnlyFn(
        contractName,
        "is-credential-valid",
        [Cl.uint(1)],
        user1
      );
      expect(isValid.result).toBeBool(false);
    });
  });

  describe("Credential Revocation", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("test-hash")],
        user1
      );
      
      simnet.callPublicFn(
        contractName,
        "add-trusted-issuer",
        [Cl.principal(trustedIssuer), Cl.stringAscii("government")],
        contractOwner
      );

      const expiresAt = simnet.blockHeight + 1000;
      simnet.callPublicFn(
        contractName,
        "issue-credential",
        [
          Cl.uint(1),
          Cl.stringAscii("github"),
          Cl.uint(expiresAt),
          Cl.stringAscii("data-hash")
        ],
        trustedIssuer
      );
    });

    it("should allow issuer to revoke credential", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "revoke-credential",
        [Cl.uint(1)],
        trustedIssuer
      );
      expect(result).toBeOk(Cl.bool(true));

      // Check credential is revoked
      const credential = simnet.callReadOnlyFn(
        contractName,
        "get-credential",
        [Cl.uint(1)],
        trustedIssuer
      );
      expect(credential.result).toBeSome(
        Cl.tuple({
          "identity-id": Cl.uint(1),
          "credential-type": Cl.stringAscii("github"),
          "issuer": Cl.principal(trustedIssuer),
          "issued-at": Cl.uint(simnet.blockHeight - 1),
          "expires-at": Cl.uint(simnet.blockHeight + 999),
          "is-revoked": Cl.bool(true),
          "data-hash": Cl.stringAscii("data-hash"),
          "verification-status": Cl.stringAscii("revoked")
        })
      );
    });

    it("should allow contract owner to revoke credential", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "revoke-credential",
        [Cl.uint(1)],
        contractOwner
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should not allow unauthorized user to revoke credential", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "revoke-credential",
        [Cl.uint(1)],
        user2
      );
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("should reject revocation of non-existent credential", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "revoke-credential",
        [Cl.uint(999)],
        trustedIssuer
      );
      expect(result).toBeErr(Cl.uint(404)); // ERR_INVALID_CREDENTIAL
    });

    it("should make revoked credential invalid", () => {
      // First verify credential
      simnet.callPublicFn(
        contractName,
        "verify-credential",
        [Cl.uint(1)],
        trustedIssuer
      );

      // Then revoke it
      simnet.callPublicFn(
        contractName,
        "revoke-credential",
        [Cl.uint(1)],
        trustedIssuer
      );

      // Check it's now invalid
      const isValid = simnet.callReadOnlyFn(
        contractName,
        "is-credential-valid",
        [Cl.uint(1)],
        user1
      );
      expect(isValid.result).toBeBool(false);
    });

    it("should reject verification of revoked credential", () => {
      // Revoke credential first
      simnet.callPublicFn(
        contractName,
        "revoke-credential",
        [Cl.uint(1)],
        trustedIssuer
      );

      // Try to verify revoked credential
      const { result } = simnet.callPublicFn(
        contractName,
        "verify-credential",
        [Cl.uint(1)],
        trustedIssuer
      );
      expect(result).toBeErr(Cl.uint(404)); // ERR_INVALID_CREDENTIAL
    });
  });

  describe("Reputation System", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("test-hash")],
        user1
      );
      
      simnet.callPublicFn(
        contractName,
        "add-trusted-issuer",
        [Cl.principal(trustedIssuer), Cl.stringAscii("government")],
        contractOwner
      );
    });

    it("should return correct initial reputation score", () => {
      const score = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-score",
        [Cl.uint(1)],
        user1
      );
      expect(score.result).toBeUint(0);
    });

    it("should return zero for non-existent identity reputation", () => {
      const score = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-score",
        [Cl.uint(999)],
        user1
      );
      expect(score.result).toBeUint(0);
    });

    it("should return correct reputation weights", () => {
      const githubWeight = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-weight",
        [Cl.stringAscii("github-contribution")],
        user1
      );
      expect(githubWeight.result).toBeSome(Cl.int(10));

      const peerReviewWeight = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-weight",
        [Cl.stringAscii("peer-review")],
        user1
      );
      expect(peerReviewWeight.result).toBeSome(Cl.int(25));

      const educationWeight = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-weight",
        [Cl.stringAscii("education-completion")],
        user1
      );
      expect(educationWeight.result).toBeSome(Cl.int(100));
    });

    it("should return none for non-existent reputation weight", () => {
      const weight = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-weight",
        [Cl.stringAscii("non-existent")],
        user1
      );
      expect(weight.result).toBeNone();
    });

    it("should allow trusted issuer to record reputation event", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [
          Cl.uint(1),
          Cl.stringAscii("github-contribution"),
          Cl.stringAscii("event-data-hash")
        ],
        trustedIssuer
      );
      expect(result).toBeOk(Cl.uint(1));

      // Check reputation score updated
      const score = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-score",
        [Cl.uint(1)],
        user1
      );
      expect(score.result).toBeUint(10);

      // Check event was recorded
      const event = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-event",
        [Cl.uint(1)],
        user1
      );
      expect(event.result).toBeSome(
        Cl.tuple({
          "identity-id": Cl.uint(1),
          "event-type": Cl.stringAscii("github-contribution"),
          "reputation-change": Cl.int(10),
          "verifier": Cl.principal(trustedIssuer),
          "timestamp": Cl.uint(simnet.blockHeight),
          "data-hash": Cl.stringAscii("event-data-hash")
        })
      );
    });

    it("should allow identity owner to record reputation event", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [
          Cl.uint(1),
          Cl.stringAscii("community-contribution"),
          Cl.stringAscii("self-reported-hash")
        ],
        user1
      );
      expect(result).toBeOk(Cl.uint(1));

      const score = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-score",
        [Cl.uint(1)],
        user1
      );
      expect(score.result).toBeUint(15);
    });

    it("should allow contract owner to record reputation event", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [
          Cl.uint(1),
          Cl.stringAscii("skill-verification"),
          Cl.stringAscii("admin-verified-hash")
        ],
        contractOwner
      );
      expect(result).toBeOk(Cl.uint(1));

      const score = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-score",
        [Cl.uint(1)],
        user1
      );
      expect(score.result).toBeUint(50);
    });

    it("should not allow unauthorized user to record reputation event", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [
          Cl.uint(1),
          Cl.stringAscii("github-contribution"),
          Cl.stringAscii("unauthorized-hash")
        ],
        user2
      );
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("should reject reputation event for non-existent identity", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [
          Cl.uint(999),
          Cl.stringAscii("github-contribution"),
          Cl.stringAscii("event-hash")
        ],
        trustedIssuer
      );
      expect(result).toBeErr(Cl.uint(403)); // ERR_IDENTITY_NOT_FOUND
    });

    it("should handle unknown event types with zero weight", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [
          Cl.uint(1),
          Cl.stringAscii("unknown-event"),
          Cl.stringAscii("event-hash")
        ],
        trustedIssuer
      );
      expect(result).toBeOk(Cl.uint(1));

      // Score should remain 0 for unknown event type
      const score = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-score",
        [Cl.uint(1)],
        user1
      );
      expect(score.result).toBeUint(0);
    });

    it("should accumulate multiple reputation events", () => {
      // Record multiple events
      simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [Cl.uint(1), Cl.stringAscii("github-contribution"), Cl.stringAscii("hash1")],
        trustedIssuer
      );

      simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [Cl.uint(1), Cl.stringAscii("peer-review"), Cl.stringAscii("hash2")],
        trustedIssuer
      );

      simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [Cl.uint(1), Cl.stringAscii("governance-vote"), Cl.stringAscii("hash3")],
        trustedIssuer
      );

      // Total should be 10 + 25 + 5 = 40
      const score = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-score",
        [Cl.uint(1)],
        user1
      );
      expect(score.result).toBeUint(40);
    });

    it("should allow owner to update reputation weights", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "update-reputation-weight",
        [Cl.stringAscii("github-contribution"), Cl.int(20)],
        contractOwner
      );
      expect(result).toBeOk(Cl.bool(true));

      // Verify weight was updated
      const weight = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-weight",
        [Cl.stringAscii("github-contribution")],
        user1
      );
      expect(weight.result).toBeSome(Cl.int(20));
    });

    it("should not allow non-owner to update reputation weights", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "update-reputation-weight",
        [Cl.stringAscii("github-contribution"), Cl.int(20)],
        user1
      );
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("should check reputation threshold correctly", () => {
      // Initially should not meet threshold (default 100)
      const meetsThreshold = simnet.callReadOnlyFn(
        contractName,
        "meets-reputation-threshold",
        [Cl.uint(1)],
        user1
      );
      expect(meetsThreshold.result).toBeBool(false);

      // Add education completion (100 points)
      simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [Cl.uint(1), Cl.stringAscii("education-completion"), Cl.stringAscii("hash")],
        trustedIssuer
      );

      // Now should meet threshold
      const meetsThresholdAfter = simnet.callReadOnlyFn(
        contractName,
        "meets-reputation-threshold",
        [Cl.uint(1)],
        user1
      );
      expect(meetsThresholdAfter.result).toBeBool(true);
    });

    it("should return none for non-existent reputation event", () => {
      const event = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-event",
        [Cl.uint(999)],
        user1
      );
      expect(event.result).toBeNone();
    });
  });

  describe("Identity Verification by Reputation", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("test-hash")],
        user1
      );
      
      simnet.callPublicFn(
        contractName,
        "add-trusted-issuer",
        [Cl.principal(trustedIssuer), Cl.stringAscii("government")],
        contractOwner
      );
    });

    it("should allow trusted issuer to verify identity with sufficient reputation", () => {
      // Build up reputation to meet threshold
      simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [Cl.uint(1), Cl.stringAscii("education-completion"), Cl.stringAscii("hash")],
        trustedIssuer
      );

      const { result } = simnet.callPublicFn(
        contractName,
        "verify-identity-by-reputation",
        [Cl.uint(1)],
        trustedIssuer
      );
      expect(result).toBeOk(Cl.bool(true));

      // Check identity is verified
      const identity = simnet.callReadOnlyFn(
        contractName,
        "get-identity",
        [Cl.uint(1)],
        user1
      );
      expect(identity.result).toBeSome(
        Cl.tuple({
          "owner": Cl.principal(user1),
          "created-at": Cl.uint(simnet.blockHeight - 2),
          "updated-at": Cl.uint(simnet.blockHeight),
          "reputation-score": Cl.uint(100),
          "is-verified": Cl.bool(true),
          "metadata-hash": Cl.stringAscii("test-hash")
        })
      );
    });

    it("should allow contract owner to verify identity with sufficient reputation", () => {
      // Build up reputation
      simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [Cl.uint(1), Cl.stringAscii("education-completion"), Cl.stringAscii("hash")],
        contractOwner
      );

      const { result } = simnet.callPublicFn(
        contractName,
        "verify-identity-by-reputation",
        [Cl.uint(1)],
        contractOwner
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should not allow unauthorized user to verify identity", () => {
      // Build up reputation first
      simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [Cl.uint(1), Cl.stringAscii("education-completion"), Cl.stringAscii("hash")],
        trustedIssuer
      );

      const { result } = simnet.callPublicFn(
        contractName,
        "verify-identity-by-reputation",
        [Cl.uint(1)],
        user2
      );
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("should reject verification with insufficient reputation", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "verify-identity-by-reputation",
        [Cl.uint(1)],
        trustedIssuer
      );
      expect(result).toBeErr(Cl.uint(406)); // ERR_INSUFFICIENT_REPUTATION
    });

    it("should reject verification of non-existent identity", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "verify-identity-by-reputation",
        [Cl.uint(999)],
        trustedIssuer
      );
      expect(result).toBeErr(Cl.uint(403)); // ERR_IDENTITY_NOT_FOUND
    });
  });

  describe("Governance Functions", () => {
    it("should allow owner to set reputation threshold", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "set-reputation-threshold",
        [Cl.uint(200)],
        contractOwner
      );
      expect(result).toBeOk(Cl.bool(true));

      // Test threshold change by creating identity and checking threshold
      simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("test-hash")],
        user1
      );

      // Should not meet new higher threshold
      const meetsThreshold = simnet.callReadOnlyFn(
        contractName,
        "meets-reputation-threshold",
        [Cl.uint(1)],
        user1
      );
      expect(meetsThreshold.result).toBeBool(false);
    });

    it("should not allow non-owner to set reputation threshold", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "set-reputation-threshold",
        [Cl.uint(200)],
        user1
      );
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("should allow owner to transfer ownership", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "transfer-ownership",
        [Cl.principal(user1)],
        contractOwner
      );
      expect(result).toBeOk(Cl.bool(true));

      // Verify new owner can perform owner functions
      const addIssuerResult = simnet.callPublicFn(
        contractName,
        "add-trusted-issuer",
        [Cl.principal(user2), Cl.stringAscii("new-type")],
        user1
      );
      expect(addIssuerResult.result).toBeOk(Cl.bool(true));

      // Verify old owner cannot perform owner functions
      const oldOwnerResult = simnet.callPublicFn(
        contractName,
        "add-trusted-issuer",
        [Cl.principal(verifier), Cl.stringAscii("another-type")],
        contractOwner
      );
      expect(oldOwnerResult.result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });

    it("should not allow non-owner to transfer ownership", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "transfer-ownership",
        [Cl.principal(user2)],
        user1
      );
      expect(result).toBeErr(Cl.uint(401)); // ERR_UNAUTHORIZED
    });
  });

  describe("API Functions", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("test-hash")],
        user1
      );
      
      simnet.callPublicFn(
        contractName,
        "add-trusted-issuer",
        [Cl.principal(trustedIssuer), Cl.stringAscii("government")],
        contractOwner
      );

      // Add some reputation
      simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [Cl.uint(1), Cl.stringAscii("education-completion"), Cl.stringAscii("hash")],
        trustedIssuer
      );

      // Verify identity
      simnet.callPublicFn(
        contractName,
        "verify-identity-by-reputation",
        [Cl.uint(1)],
        trustedIssuer
      );
    });

    it("should return correct identity verification API response for existing identity", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "verify-identity-api",
        [Cl.uint(1)],
        user1
      );
      expect(result).toEqual(
        Cl.tuple({
          "exists": Cl.bool(true),
          "is-verified": Cl.bool(true),
          "reputation-score": Cl.uint(100),
          "meets-threshold": Cl.bool(true)
        })
      );
    });

    it("should return correct identity verification API response for non-existent identity", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "verify-identity-api",
        [Cl.uint(999)],
        user1
      );
      expect(result).toEqual(
        Cl.tuple({
          "exists": Cl.bool(false),
          "is-verified": Cl.bool(false),
          "reputation-score": Cl.uint(0),
          "meets-threshold": Cl.bool(false)
        })
      );
    });

    it("should handle bulk credential verification", () => {
      // Issue and verify some credentials
      const expiresAt = simnet.blockHeight + 1000;
      
      simnet.callPublicFn(
        contractName,
        "issue-credential",
        [Cl.uint(1), Cl.stringAscii("github"), Cl.uint(expiresAt), Cl.stringAscii("hash1")],
        trustedIssuer
      );

      simnet.callPublicFn(
        contractName,
        "verify-credential",
        [Cl.uint(1)],
        trustedIssuer
      );

      simnet.callPublicFn(
        contractName,
        "issue-credential",
        [Cl.uint(1), Cl.stringAscii("linkedin"), Cl.uint(expiresAt), Cl.stringAscii("hash2")],
        trustedIssuer
      );

      simnet.callPublicFn(
        contractName,
        "verify-credential",
        [Cl.uint(2)],
        trustedIssuer
      );

      const { result } = simnet.callReadOnlyFn(
        contractName,
        "bulk-verify-credentials",
        [
          Cl.uint(1),
          Cl.list([
            Cl.stringAscii("github"),
            Cl.stringAscii("linkedin"),
            Cl.stringAscii("twitter")
          ])
        ],
        user1
      );
      
      expect(result).toEqual(
        Cl.list([
          Cl.bool(true),  // github credential exists and is valid
          Cl.bool(true),  // linkedin credential exists and is valid
          Cl.bool(false)  // twitter credential doesn't exist
        ])
      );
    });

    it("should handle bulk verification for identity with no credentials", () => {
      // Create another identity with no credentials
      simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("test-hash-2")],
        user2
      );

      const { result } = simnet.callReadOnlyFn(
        contractName,
        "bulk-verify-credentials",
        [
          Cl.uint(2),
          Cl.list([
            Cl.stringAscii("github"),
            Cl.stringAscii("linkedin")
          ])
        ],
        user2
      );
      
      expect(result).toEqual(
        Cl.list([
          Cl.bool(false),
          Cl.bool(false)
        ])
      );
    });
  });

  describe("Integration Tests", () => {
    it("should handle complete identity lifecycle", () => {
      // Create identity
      const createResult = simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("complete-lifecycle-hash")],
        user1
      );
      expect(createResult.result).toBeOk(Cl.uint(1));

      // Add trusted issuer
      simnet.callPublicFn(
        contractName,
        "add-trusted-issuer",
        [Cl.principal(trustedIssuer), Cl.stringAscii("university")],
        contractOwner
      );

      // Issue credentials
      const expiresAt = simnet.blockHeight + 1000;
      simnet.callPublicFn(
        contractName,
        "issue-credential",
        [Cl.uint(1), Cl.stringAscii("degree"), Cl.uint(expiresAt), Cl.stringAscii("degree-hash")],
        trustedIssuer
      );

      // Verify credential
      simnet.callPublicFn(
        contractName,
        "verify-credential",
        [Cl.uint(1)],
        trustedIssuer
      );

      // Record reputation events
      simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [Cl.uint(1), Cl.stringAscii("education-completion"), Cl.stringAscii("event-hash")],
        trustedIssuer
      );

      // Verify identity by reputation
      simnet.callPublicFn(
        contractName,
        "verify-identity-by-reputation",
        [Cl.uint(1)],
        trustedIssuer
      );

      // Final verification through API
      const apiResult = simnet.callReadOnlyFn(
        contractName,
        "verify-identity-api",
        [Cl.uint(1)],
        user1
      );
      
      expect(apiResult.result).toEqual(
        Cl.tuple({
          "exists": Cl.bool(true),
          "is-verified": Cl.bool(true),
          "reputation-score": Cl.uint(100),
          "meets-threshold": Cl.bool(true)
        })
      );
    });

    it("should handle multiple identities with different reputation levels", () => {
      // Create multiple identities
      simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("user1-hash")],
        user1
      );

      simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("user2-hash")],
        user2
      );

      // Add trusted issuer
      simnet.callPublicFn(
        contractName,
        "add-trusted-issuer",
        [Cl.principal(trustedIssuer), Cl.stringAscii("platform")],
        contractOwner
      );

      // Give user1 high reputation
      simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [Cl.uint(1), Cl.stringAscii("education-completion"), Cl.stringAscii("hash1")],
        trustedIssuer
      );

      // Give user2 low reputation
      simnet.callPublicFn(
        contractName,
        "record-reputation-event",
        [Cl.uint(2), Cl.stringAscii("github-contribution"), Cl.stringAscii("hash2")],
        trustedIssuer
      );

      // Check reputation scores
      const score1 = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-score",
        [Cl.uint(1)],
        user1
      );
      expect(score1.result).toBeUint(100);

      const score2 = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-score",
        [Cl.uint(2)],
        user2
      );
      expect(score2.result).toBeUint(10);

      // Check threshold compliance
      const meetsThreshold1 = simnet.callReadOnlyFn(
        contractName,
        "meets-reputation-threshold",
        [Cl.uint(1)],
        user1
      );
      expect(meetsThreshold1.result).toBeBool(true);

      const meetsThreshold2 = simnet.callReadOnlyFn(
        contractName,
        "meets-reputation-threshold",
        [Cl.uint(2)],
        user2
      );
      expect(meetsThreshold2.result).toBeBool(false);
    });

    it("should handle credential expiration lifecycle", () => {
      // Setup
      simnet.callPublicFn(
        contractName,
        "create-identity",
        [Cl.stringAscii("expiry-test-hash")],
        user1
      );

      simnet.callPublicFn(
        contractName,
        "add-trusted-issuer",
        [Cl.principal(trustedIssuer), Cl.stringAscii("temp-issuer")],
        contractOwner
      );

      // Issue short-lived credential
      const expiresAt = simnet.blockHeight + 2;
      simnet.callPublicFn(
        contractName,
        "issue-credential",
        [Cl.uint(1), Cl.stringAscii("temp-cert"), Cl.uint(expiresAt), Cl.stringAscii("temp-hash")],
        trustedIssuer
      );

      // Verify credential
      simnet.callPublicFn(
        contractName,
        "verify-credential",
        [Cl.uint(1)],
        trustedIssuer
      );

      // Check credential is valid
      const isValidBefore = simnet.callReadOnlyFn(
        contractName,
        "is-credential-valid",
        [Cl.uint(1)],
        user1
      );
      expect(isValidBefore.result).toBeBool(true);

      // Mine blocks to expire credential
      simnet.mineEmptyBlocks(3);

      // Check credential is now invalid
      const isValidAfter = simnet.callReadOnlyFn(
        contractName,
        "is-credential-valid",
        [Cl.uint(1)],
        user1
      );
      expect(isValidAfter.result).toBeBool(false);

      // Should not be able to verify expired credential
      const verifyResult = simnet.callPublicFn(
        contractName,
        "verify-credential",
        [Cl.uint(1)],
        trustedIssuer
      );
      expect(verifyResult.result).toBeErr(Cl.uint(405)); // ERR_CREDENTIAL_EXPIRED
    });
  });
});