;; =====================================================
;; STACKSID: DECENTRALIZED IDENTITY & REPUTATION ORACLE
;; =====================================================

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u401))
(define-constant ERR_IDENTITY_EXISTS (err u402))
(define-constant ERR_IDENTITY_NOT_FOUND (err u403))
(define-constant ERR_INVALID_CREDENTIAL (err u404))
(define-constant ERR_CREDENTIAL_EXPIRED (err u405))
(define-constant ERR_INSUFFICIENT_REPUTATION (err u406))

;; Data Variables
(define-data-var contract-owner principal CONTRACT_OWNER)
(define-data-var next-identity-id uint u1)
(define-data-var next-credential-id uint u1)
(define-data-var min-reputation-threshold uint u100)

;; Identity Structure
(define-map identities
    { identity-id: uint }
    {
        owner: principal,
        created-at: uint,
        updated-at: uint,
        reputation-score: uint,
        is-verified: bool,
        metadata-hash: (string-ascii 64),
    }
)

;; Principal to Identity ID mapping
(define-map principal-to-identity
    { owner: principal }
    { identity-id: uint }
)

;; Credential Structure
(define-map credentials
    { credential-id: uint }
    {
        identity-id: uint,
        credential-type: (string-ascii 32),
        issuer: principal,
        issued-at: uint,
        expires-at: uint,
        is-revoked: bool,
        data-hash: (string-ascii 64),
        verification-status: (string-ascii 16),
    }
)

;; Identity Credentials mapping
(define-map identity-credentials
    {
        identity-id: uint,
        credential-type: (string-ascii 32),
    }
    { credential-id: uint }
)

;; Trusted Issuers
(define-map trusted-issuers
    { issuer: principal }
    {
        is-trusted: bool,
        added-at: uint,
        issuer-type: (string-ascii 32),
    }
)

;; Read-only functions
(define-read-only (get-identity (identity-id uint))
    (map-get? identities { identity-id: identity-id })
)

(define-read-only (get-identity-by-principal (owner principal))
    (match (map-get? principal-to-identity { owner: owner })
        identity-data (get-identity (get identity-id identity-data))
        none
    )
)

(define-read-only (get-credential (credential-id uint))
    (map-get? credentials { credential-id: credential-id })
)

(define-read-only (is-trusted-issuer (issuer principal))
    (default-to false
        (get is-trusted (map-get? trusted-issuers { issuer: issuer }))
    )
)

;; Core Identity Management Functions
(define-public (create-identity (metadata-hash (string-ascii 64)))
    (let (
            (identity-id (var-get next-identity-id))
            (current-block stacks-block-height)
        )
        ;; Check if identity already exists
        (asserts! (is-none (map-get? principal-to-identity { owner: tx-sender }))
            ERR_IDENTITY_EXISTS
        )
        ;; Create identity record
        (map-set identities { identity-id: identity-id } {
            owner: tx-sender,
            created-at: current-block,
            updated-at: current-block,
            reputation-score: u0,
            is-verified: false,
            metadata-hash: metadata-hash,
        })
        ;; Map principal to identity
        (map-set principal-to-identity { owner: tx-sender } { identity-id: identity-id })
        ;; Increment identity counter
        (var-set next-identity-id (+ identity-id u1))
        (ok identity-id)
    )
)

(define-public (update-identity-metadata (metadata-hash (string-ascii 64)))
    (let (
            (identity-lookup (unwrap! (map-get? principal-to-identity { owner: tx-sender })
                ERR_IDENTITY_NOT_FOUND
            ))
            (identity-id (get identity-id identity-lookup))
            (current-identity (unwrap! (get-identity identity-id) ERR_IDENTITY_NOT_FOUND))
        )
        (map-set identities { identity-id: identity-id }
            (merge current-identity {
                metadata-hash: metadata-hash,
                updated-at: stacks-block-height,
            })
        )
        (ok true)
    )
)

;; Credential Management Functions
(define-public (issue-credential
        (identity-id uint)
        (credential-type (string-ascii 32))
        (expires-at uint)
        (data-hash (string-ascii 64))
    )
    (let (
            (credential-id (var-get next-credential-id))
            (current-block stacks-block-height)
            (identity-data (unwrap! (get-identity identity-id) ERR_IDENTITY_NOT_FOUND))
        )
        ;; Check if issuer is trusted or is the identity owner
        (asserts!
            (or
                (is-trusted-issuer tx-sender)
                (is-eq tx-sender (get owner identity-data))
                (is-eq tx-sender (var-get contract-owner))
            )
            ERR_UNAUTHORIZED
        )
        ;; Check expiration date is in the future
        (asserts! (> expires-at current-block) ERR_INVALID_CREDENTIAL)
        ;; Create credential
        (map-set credentials { credential-id: credential-id } {
            identity-id: identity-id,
            credential-type: credential-type,
            issuer: tx-sender,
            issued-at: current-block,
            expires-at: expires-at,
            is-revoked: false,
            data-hash: data-hash,
            verification-status: "pending",
        })
        ;; Map identity to credential
        (map-set identity-credentials {
            identity-id: identity-id,
            credential-type: credential-type,
        } { credential-id: credential-id }
        )
        ;; Increment credential counter
        (var-set next-credential-id (+ credential-id u1))
        (ok credential-id)
    )
)

(define-public (verify-credential (credential-id uint))
    (let ((credential (unwrap! (get-credential credential-id) ERR_INVALID_CREDENTIAL)))
        ;; Only trusted issuers or contract owner can verify
        (asserts!
            (or
                (is-trusted-issuer tx-sender)
                (is-eq tx-sender (var-get contract-owner))
            )
            ERR_UNAUTHORIZED
        )
        ;; Check credential is not revoked and not expired
        (asserts! (not (get is-revoked credential)) ERR_INVALID_CREDENTIAL)
        (asserts! (> (get expires-at credential) stacks-block-height)
            ERR_CREDENTIAL_EXPIRED
        )
        ;; Update verification status
        (map-set credentials { credential-id: credential-id }
            (merge credential { verification-status: "verified" })
        )
        (ok true)
    )
)

(define-public (revoke-credential (credential-id uint))
    (let ((credential (unwrap! (get-credential credential-id) ERR_INVALID_CREDENTIAL)))
        ;; Only issuer or contract owner can revoke
        (asserts!
            (or
                (is-eq tx-sender (get issuer credential))
                (is-eq tx-sender (var-get contract-owner))
            )
            ERR_UNAUTHORIZED
        )
        ;; Revoke credential
        (map-set credentials { credential-id: credential-id }
            (merge credential {
                is-revoked: true,
                verification-status: "revoked",
            })
        )
        (ok true)
    )
)

;; Verification Functions
(define-read-only (is-credential-valid (credential-id uint))
    (match (get-credential credential-id)
        credential (and
            (not (get is-revoked credential))
            (> (get expires-at credential) stacks-block-height)
            (is-eq (get verification-status credential) "verified")
        )
        false
    )
)

(define-read-only (get-identity-credential
        (identity-id uint)
        (credential-type (string-ascii 32))
    )
    (match (map-get? identity-credentials {
        identity-id: identity-id,
        credential-type: credential-type,
    })
        cred-ref (get-credential (get credential-id cred-ref))
        none
    )
)

(define-read-only (has-valid-credential
        (identity-id uint)
        (credential-type (string-ascii 32))
    )
    (match (map-get? identity-credentials {
        identity-id: identity-id,
        credential-type: credential-type,
    })
        cred-ref (is-credential-valid (get credential-id cred-ref))
        false
    )
)

;; Issuer Management
(define-public (add-trusted-issuer
        (issuer principal)
        (issuer-type (string-ascii 32))
    )
    (begin
        (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_UNAUTHORIZED)
        (map-set trusted-issuers { issuer: issuer } {
            is-trusted: true,
            added-at: stacks-block-height,
            issuer-type: issuer-type,
        })
        (ok true)
    )
)

(define-public (remove-trusted-issuer (issuer principal))
    (begin
        (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_UNAUTHORIZED)
        (map-delete trusted-issuers { issuer: issuer })
        (ok true)
    )
)

;; Reputation Events
(define-map reputation-events
    { event-id: uint }
    {
        identity-id: uint,
        event-type: (string-ascii 32),
        reputation-change: int,
        verifier: principal,
        timestamp: uint,
        data-hash: (string-ascii 64),
    }
)

(define-data-var next-event-id uint u1)

;; Event Types and Their Reputation Values
(define-map reputation-weights
    { event-type: (string-ascii 32) }
    { weight: int }
)

;; Initialize reputation weights
(map-set reputation-weights { event-type: "github-contribution" } { weight: 10 })
(map-set reputation-weights { event-type: "peer-review" } { weight: 25 })
(map-set reputation-weights { event-type: "governance-vote" } { weight: 5 })
(map-set reputation-weights { event-type: "skill-verification" } { weight: 50 })
(map-set reputation-weights { event-type: "community-contribution" } { weight: 15 })
(map-set reputation-weights { event-type: "education-completion" } { weight: 100 })

;; Reputation Mining Functions
(define-public (record-reputation-event
        (identity-id uint)
        (event-type (string-ascii 32))
        (data-hash (string-ascii 64))
    )
    (let (
            (event-id (var-get next-event-id))
            (identity-data (unwrap! (get-identity identity-id) ERR_IDENTITY_NOT_FOUND))
            (reputation-weight (default-to 0
                (get weight
                    (map-get? reputation-weights { event-type: event-type })
                )))
        )
        ;; Check if caller is authorized (trusted issuer, identity owner, or contract owner)
        (asserts!
            (or
                (is-trusted-issuer tx-sender)
                (is-eq tx-sender (get owner identity-data))
                (is-eq tx-sender (var-get contract-owner))
            )
            ERR_UNAUTHORIZED
        )
        ;; Record reputation event
        (map-set reputation-events { event-id: event-id } {
            identity-id: identity-id,
            event-type: event-type,
            reputation-change: reputation-weight,
            verifier: tx-sender,
            timestamp: stacks-block-height,
            data-hash: data-hash,
        })
        ;; Update identity reputation score
        (map-set identities { identity-id: identity-id }
            (merge identity-data {
                reputation-score: (+ (get reputation-score identity-data)
                    (to-uint reputation-weight)
                ),
                updated-at: stacks-block-height,
            })
        )
        ;; Increment event counter
        (var-set next-event-id (+ event-id u1))
        (ok event-id)
    )
)

(define-public (update-reputation-weight
        (event-type (string-ascii 32))
        (weight int)
    )
    (begin
        (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_UNAUTHORIZED)
        (map-set reputation-weights { event-type: event-type } { weight: weight })
        (ok true)
    )
)

;; Verification and Query Functions
(define-read-only (get-reputation-score (identity-id uint))
    (default-to u0 (get reputation-score (get-identity identity-id)))
)

(define-read-only (meets-reputation-threshold (identity-id uint))
    (>= (get-reputation-score identity-id) (var-get min-reputation-threshold))
)

(define-read-only (get-reputation-event (event-id uint))
    (map-get? reputation-events { event-id: event-id })
)

(define-read-only (get-reputation-weight (event-type (string-ascii 32)))
    (get weight (map-get? reputation-weights { event-type: event-type }))
)

;; Identity Verification Based on Reputation
(define-public (verify-identity-by-reputation (identity-id uint))
    (let ((identity-data (unwrap! (get-identity identity-id) ERR_IDENTITY_NOT_FOUND)))
        ;; Check if caller is authorized
        (asserts!
            (or
                (is-trusted-issuer tx-sender)
                (is-eq tx-sender (var-get contract-owner))
            )
            ERR_UNAUTHORIZED
        )
        ;; Check if meets reputation threshold
        (asserts! (meets-reputation-threshold identity-id)
            ERR_INSUFFICIENT_REPUTATION
        )
        ;; Verify identity
        (map-set identities { identity-id: identity-id }
            (merge identity-data {
                is-verified: true,
                updated-at: stacks-block-height,
            })
        )
        (ok true)
    )
)

;; Governance Functions
(define-public (set-reputation-threshold (new-threshold uint))
    (begin
        (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_UNAUTHORIZED)
        (var-set min-reputation-threshold new-threshold)
        (ok true)
    )
)

(define-public (transfer-ownership (new-owner principal))
    (begin
        (asserts! (is-eq tx-sender (var-get contract-owner)) ERR_UNAUTHORIZED)
        (var-set contract-owner new-owner)
        (ok true)
    )
)

;; Cross-Platform Integration APIs
(define-read-only (verify-identity-api (identity-id uint))
    (match (get-identity identity-id)
        identity
        {
            exists: true,
            is-verified: (get is-verified identity),
            reputation-score: (get reputation-score identity),
            meets-threshold: (meets-reputation-threshold identity-id),
        }
        {
            exists: false,
            is-verified: false,
            reputation-score: u0,
            meets-threshold: false,
        }
    )
)

(define-read-only (bulk-verify-credentials
        (identity-id uint)
        (credential-types (list 10 (string-ascii 32)))
    )
    (map has-valid-credential
        (list
            identity-id             identity-id             identity-id
            identity-id             identity-id
            identity-id             identity-id             identity-id
            identity-id             identity-id
        )
        credential-types
    )
)
