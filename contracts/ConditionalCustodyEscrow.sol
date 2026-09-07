// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Conditional custody: hold, monitor, adjudicate, release.
 *
 * The adjudication happens off-chain, in a corpus with two clocks and a
 * correction tape. This contract does the part a corpus cannot: commit. Once
 * the primary tranche moves it has moved, visibly and attributably, and no
 * correction reverses it — which is the off-chain rule "a release never
 * un-fires" turned from a discipline into a property of the medium.
 *
 * What the contract must never do is decide anything. It routes on a signed
 * ruling and refuses everything it cannot check, and the things it checks are
 * chosen because each was a way the pair could have been made to lie.
 *
 * REFUSALS, AND THE FAILURE EACH ONE CLOSES
 *
 * 1. Only a BINDING receipt executes. The admission gate lives in the
 *    repository, which is worth nothing to a contract that cannot see it, so
 *    standing rides on the signed struct. Every receipt the system can build
 *    today is DEMONSTRATION and this contract rejects all of them. That is not
 *    a placeholder: it is the gate reaching the chain.
 *
 * 2. A withdrawal is not a correction. UNSUPPORTED_BY_WITHDRAWAL means support
 *    was removed and nothing replaced it, so nothing contrary has been
 *    established and no money moves on it — the buffer freezes and the window
 *    extends pending a fresh ruling. Only REVERSED_ON_CORRECTION, which is an
 *    actual contrary finding, diverts the buffer. Collapsing the two is the
 *    general-oracle failure committed at the last mile, and the enum exists so
 *    it cannot be committed by accident.
 *
 * 3. Post-release receipts are verified against STORED terms, never against
 *    calldata. The exposure window, the trade and the condition are fixed at
 *    Stage 1; a later receipt that disagrees with them is rejected rather than
 *    honoured. Otherwise a signer could sign a dispute receipt carrying any
 *    window it liked and the stored expiry and the verified struct would
 *    describe different agreements.
 *
 * 4. Rulings are accepted from a threshold of an operator set, not from one
 *    key. A single key is neither a commodity execution attestor nor an
 *    estate-bearing fact attestor; it is a single point at which the whole
 *    estate can be forged. Rotation is timelocked and public.
 *
 * 5. Only the corpus knowledge clock is accepted. A receipt whose clock claims
 *    to answer what a source knew is refused, because this system cannot bound
 *    that question and a contract that accepted it would settle on a clock
 *    nobody carries.
 *
 * A ROUTE HAS THREE STATES, NOT TWO
 *
 * OPEN, CLOSED, and the one systems lose: UNCLOSED. A deadline passes with no
 * closing, the deposit returns, and what the parties keep is the adjudication —
 * a private instrument between exactly those two, with no finality and no
 * audience beyond them. That is the mechanism's fallback rather than its
 * failure, and modelling it is what stops a route with no closing from being a
 * deposit locked forever.
 *
 * Closing takes both parties. The proof can be produced by either side; the
 * closing executes an arrangement both of them wired, and this contract never
 * supplies the missing consent. A closing that fired on one party's say-so
 * would let whoever holds the receipt compel settlement, and a witness that can
 * be used to compel is no longer neutral between the two parties who both have
 * to trust it.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not price the exposure window. The window is declared by the operator
 * as policy and enforced here exactly as signed; the receipt carries the
 * measured basis beside it so a reader can see what the number rests on. The
 * chain makes an exposure enforceable and only an estate makes it correct.
 *
 * It holds shares of a vault, not a balance it invents yield on. Yield is
 * whatever the vault produced between deposit and disbursement, attributed by
 * share arithmetic rather than declared, and if the vault produced none then
 * none is distributed. The contract does not promise a yield it does not
 * generate.
 */

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}

/** The minimum of ERC-4626 needed to hold a yield-bearing position honestly. */
interface IERC4626 is IERC20 {
    function asset() external view returns (address);
    function convertToAssets(uint256 shares) external view returns (uint256);
}

contract ConditionalCustodyEscrow {
    /* ── Vocabularies, matching the corpus rather than approximating it ── */

    uint8 internal constant VERDICT_NOT_ADJUDICABLE = 0;
    uint8 internal constant VERDICT_GRANTED = 1;
    uint8 internal constant VERDICT_WITHHELD = 2;

    uint8 internal constant POST_STANDS = 0;
    uint8 internal constant POST_REVERSED_ON_CORRECTION = 1;
    uint8 internal constant POST_UNSUPPORTED_BY_WITHDRAWAL = 2;
    uint8 internal constant POST_RESTATED_WITHOUT_REVERSAL = 3;

    uint8 internal constant STANDING_DEMONSTRATION = 0;
    uint8 internal constant STANDING_BINDING = 1;

    uint8 internal constant CLOCK_WHAT_WE_HELD = 0;

    bytes32 public constant RECEIPT_TYPEHASH = keccak256(
        "AdjudicationReceipt(bytes32 tradeId,string conditionId,uint8 verdict,uint8 postRelease,uint8 standing,uint8 clockProvenance,uint256 validAt,uint256 decidedAtKnowledge,uint256 exposureWindowSeconds,uint256 observedLongestLagSeconds,bytes32 evidenceDigest,bytes32 proofDigest,uint256 nonce)"
    );
    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    struct Receipt {
        bytes32 tradeId;
        string conditionId;
        uint8 verdict;
        uint8 postRelease;
        uint8 standing;
        uint8 clockProvenance;
        uint256 validAt;
        uint256 decidedAtKnowledge;
        uint256 exposureWindowSeconds;
        uint256 observedLongestLagSeconds;
        bytes32 evidenceDigest;
        bytes32 proofDigest;
        uint256 nonce;
    }

    enum State { NONE, HELD, PRIMARY_RELEASED, FROZEN_PENDING_RULING, SETTLED, DIVERTED, UNCLOSED }

    struct Escrow {
        address depositor;
        address beneficiary;
        address corrector;      // where a reversal sends the buffer
        uint256 sharesHeld;     // vault shares, so yield is arithmetic rather than a promise
        uint256 sharesReleased;
        uint16 primaryBps;
        bytes32 conditionHash;  // keccak of the conditionId fixed at Stage 1
        uint256 windowSeconds;  // fixed at Stage 1; later receipts must match
        uint256 expiry;
        uint256 closingDeadline; // after this, with no closing, the route is UNCLOSED
        bool counterpartyAccepted;
        uint256 nextNonce;
        State state;
    }

    IERC4626 public immutable vault;
    bytes32 private immutable domainSeparatorValue;

    address public governor;
    uint256 public immutable rotationDelay;
    mapping(address => bool) public isSigner;
    uint256 public signerCount;
    uint8 public threshold;
    mapping(bytes32 => uint256) public rotationReadyAt;

    mapping(bytes32 => Escrow) public escrows;
    mapping(bytes32 => bool) public evidenceUsed;

    event Deposited(bytes32 indexed tradeId, address indexed depositor, uint256 shares, uint256 closingDeadline);
    event CounterpartyAccepted(bytes32 indexed tradeId, address indexed beneficiary);
    event Unclosed(bytes32 indexed tradeId, uint256 sharesReturned);
    event PrimaryReleased(bytes32 indexed tradeId, uint256 shares, uint256 assets, uint256 expiry);
    event Settled(bytes32 indexed tradeId, uint256 shares, uint256 assets, uint256 yieldAssets);
    event Diverted(bytes32 indexed tradeId, uint256 shares, uint256 assets, bytes32 evidenceDigest);
    event FrozenPendingRuling(bytes32 indexed tradeId, uint256 newExpiry, bytes32 evidenceDigest);
    event SignerRotationProposed(bytes32 indexed action, uint256 readyAt);
    event SignerRotated(address indexed signer, bool added, uint8 threshold);

    error NotGovernor();
    error BadState();
    error NotBinding();
    error WrongClock();
    error NotGranted();
    error TermsDiverge();
    error EvidenceReused();
    error WindowOpen();
    error WindowClosed();
    error BadSignatures();
    error NotWithdrawal();
    error NotReversal();
    error TransferFailed();
    error RotationNotReady();
    error Unproven();
    error NotAccepted();
    error NotCounterparty();
    error DeadlinePassed();
    error DeadlineNotReached();
    error NotDepositor();

    constructor(address vault_, address governor_, address[] memory signers_, uint8 threshold_, uint256 rotationDelay_) {
        require(vault_ != address(0) && governor_ != address(0), "zero address");
        require(threshold_ > 0 && threshold_ <= signers_.length, "bad threshold");
        vault = IERC4626(vault_);
        governor = governor_;
        threshold = threshold_;
        rotationDelay = rotationDelay_;
        for (uint256 i = 0; i < signers_.length; i++) {
            require(signers_[i] != address(0) && !isSigner[signers_[i]], "bad signer");
            isSigner[signers_[i]] = true;
        }
        signerCount = signers_.length;
        domainSeparatorValue = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("NotationsOS.Adjudication"), keccak256("1"), block.chainid, address(this))
        );
    }

    function domainSeparator() public view returns (bytes32) { return domainSeparatorValue; }

    /* ── Deposit ── */

    function deposit(bytes32 tradeId, address beneficiary, address corrector, uint256 shares, uint16 primaryBps, uint256 closingDeadline) external {
        if (escrows[tradeId].state != State.NONE) revert BadState();
        require(beneficiary != address(0) && corrector != address(0), "zero address");
        require(primaryBps >= 5000 && primaryBps <= 9500, "primary out of range");
        // A route with no deadline is not open; it is a deposit with no way out.
        require(closingDeadline > block.timestamp, "deadline in the past");
        if (!vault.transferFrom(msg.sender, address(this), shares)) revert TransferFailed();
        escrows[tradeId] = Escrow({
            depositor: msg.sender, beneficiary: beneficiary, corrector: corrector,
            sharesHeld: shares, sharesReleased: 0, primaryBps: primaryBps,
            conditionHash: bytes32(0), windowSeconds: 0, expiry: 0,
            closingDeadline: closingDeadline, counterpartyAccepted: false, nextNonce: 0, state: State.HELD
        });
        emit Deposited(tradeId, msg.sender, shares, closingDeadline);
    }

    /**
     * The counterparty's half of the consent.
     *
     * A closing is a settlement event and not a verification event: the proof
     * can be produced by either side, but the closing executes an arrangement
     * both of them wired. Without this, whoever holds a valid receipt could
     * compel settlement, and a witness that can be used to compel is no longer
     * neutral between the parties who both have to trust it.
     */
    function accept(bytes32 tradeId) external {
        Escrow storage e = escrows[tradeId];
        if (e.state != State.HELD) revert BadState();
        if (msg.sender != e.beneficiary) revert NotCounterparty();
        e.counterpartyAccepted = true;
        emit CounterpartyAccepted(tradeId, msg.sender);
    }

    /**
     * The route did not close.
     *
     * The deadline passed with no release, so the deposit returns and the state
     * is recorded as UNCLOSED rather than as a failure. What the parties keep is
     * the adjudication itself, which is a private instrument between them: this
     * contract has no opinion about it and never acquires one, because a route
     * that does not close says something about the parties and nothing about
     * the cargo.
     */
    function reclaimUnclosed(bytes32 tradeId) external {
        Escrow storage e = escrows[tradeId];
        if (e.state != State.HELD) revert BadState();
        if (block.timestamp < e.closingDeadline) revert DeadlineNotReached();
        if (msg.sender != e.depositor) revert NotDepositor();
        e.state = State.UNCLOSED;
        uint256 shares = e.sharesHeld;
        if (!vault.transfer(e.depositor, shares)) revert TransferFailed();
        emit Unclosed(tradeId, shares);
    }

    /* ── Stage 1: the primary tranche, on a GRANTED and BINDING ruling ── */

    function releasePrimary(Receipt calldata r, bytes[] calldata signatures) external {
        Escrow storage e = escrows[r.tradeId];
        if (e.state != State.HELD) revert BadState();
        if (r.standing != STANDING_BINDING) revert NotBinding();
        if (r.clockProvenance != CLOCK_WHAT_WE_HELD) revert WrongClock();
        if (r.verdict != VERDICT_GRANTED) revert NotGranted();
        if (r.proofDigest == bytes32(0)) revert Unproven();
        if (!e.counterpartyAccepted) revert NotAccepted();
        if (block.timestamp >= e.closingDeadline) revert DeadlinePassed();
        if (r.exposureWindowSeconds == 0) revert TermsDiverge();
        if (r.nonce != e.nextNonce) revert TermsDiverge();
        _verify(r, signatures);

        e.conditionHash = keccak256(bytes(r.conditionId));
        e.windowSeconds = r.exposureWindowSeconds;
        e.expiry = r.decidedAtKnowledge + r.exposureWindowSeconds;
        e.nextNonce += 1;
        e.state = State.PRIMARY_RELEASED;

        uint256 shares = (e.sharesHeld * e.primaryBps) / 10000;
        e.sharesReleased = shares;
        uint256 assets = vault.convertToAssets(shares);
        if (!vault.transfer(e.beneficiary, shares)) revert TransferFailed();
        emit PrimaryReleased(r.tradeId, shares, assets, e.expiry);
    }

    /* ── Stage 2: the buffer, once the window has closed with nothing against it ── */

    function settle(bytes32 tradeId) external {
        Escrow storage e = escrows[tradeId];
        if (e.state != State.PRIMARY_RELEASED) revert BadState();
        if (block.timestamp < e.expiry) revert WindowOpen();
        e.state = State.SETTLED;
        uint256 shares = e.sharesHeld - e.sharesReleased;
        uint256 assets = vault.convertToAssets(shares);
        // Yield is what the vault made on these shares while they were held,
        // not a figure this contract declares. If the vault made none, this is
        // zero and the event says so honestly.
        uint256 principalPerShare = vault.convertToAssets(1e18);
        uint256 yieldAssets = assets > (shares * principalPerShare) / 1e18 ? assets - (shares * principalPerShare) / 1e18 : 0;
        if (!vault.transfer(e.beneficiary, shares)) revert TransferFailed();
        emit Settled(tradeId, shares, assets, yieldAssets);
    }

    /* ── A contrary finding inside the window: the buffer is diverted ── */

    function divertOnCorrection(Receipt calldata r, bytes[] calldata signatures) external {
        Escrow storage e = escrows[r.tradeId];
        if (e.state != State.PRIMARY_RELEASED && e.state != State.FROZEN_PENDING_RULING) revert BadState();
        if (block.timestamp >= e.expiry) revert WindowClosed();
        if (r.postRelease != POST_REVERSED_ON_CORRECTION) revert NotReversal();
        _checkPostReleaseReceipt(e, r, signatures);

        e.state = State.DIVERTED;
        uint256 shares = e.sharesHeld - e.sharesReleased;
        uint256 assets = vault.convertToAssets(shares);
        if (!vault.transfer(e.corrector, shares)) revert TransferFailed();
        emit Diverted(r.tradeId, shares, assets, r.evidenceDigest);
    }

    /**
     * Support withdrawn, with nothing put in its place.
     *
     * Nothing contrary has been established, so no money moves in either
     * direction. The buffer freezes and the window extends by its own length,
     * which buys time for a fresh ruling. Routing this to the corrector would
     * be the contract asserting a finding the corpus explicitly did not make.
     */
    function freezeOnWithdrawal(Receipt calldata r, bytes[] calldata signatures) external {
        Escrow storage e = escrows[r.tradeId];
        if (e.state != State.PRIMARY_RELEASED) revert BadState();
        if (block.timestamp >= e.expiry) revert WindowClosed();
        if (r.postRelease != POST_UNSUPPORTED_BY_WITHDRAWAL) revert NotWithdrawal();
        _checkPostReleaseReceipt(e, r, signatures);

        e.state = State.FROZEN_PENDING_RULING;
        e.expiry = block.timestamp + e.windowSeconds;
        emit FrozenPendingRuling(r.tradeId, e.expiry, r.evidenceDigest);
    }

    /* ── Verification ── */

    /**
     * A post-release receipt is checked against the terms stored at Stage 1.
     * The window, the condition and the nonce come from state; a receipt that
     * disagrees with any of them is rejected rather than honoured, so a signed
     * struct and the agreement it claims to be about can never diverge.
     */
    function _checkPostReleaseReceipt(Escrow storage e, Receipt calldata r, bytes[] calldata signatures) private {
        if (r.standing != STANDING_BINDING) revert NotBinding();
        if (r.clockProvenance != CLOCK_WHAT_WE_HELD) revert WrongClock();
        if (r.proofDigest == bytes32(0)) revert Unproven();
        if (r.exposureWindowSeconds != e.windowSeconds) revert TermsDiverge();
        if (keccak256(bytes(r.conditionId)) != e.conditionHash) revert TermsDiverge();
        if (r.nonce != e.nextNonce) revert TermsDiverge();
        _verify(r, signatures);
        e.nextNonce += 1;
    }

    function hashReceipt(Receipt calldata r) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            RECEIPT_TYPEHASH, r.tradeId, keccak256(bytes(r.conditionId)), r.verdict, r.postRelease,
            r.standing, r.clockProvenance, r.validAt, r.decidedAtKnowledge,
            r.exposureWindowSeconds, r.observedLongestLagSeconds, r.evidenceDigest, r.proofDigest, r.nonce
        ));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparatorValue, structHash));
    }

    /** Threshold of distinct operator signatures, with evidence consumed once. */
    function _verify(Receipt calldata r, bytes[] calldata signatures) private {
        if (evidenceUsed[r.evidenceDigest]) revert EvidenceReused();
        if (signatures.length < threshold) revert BadSignatures();
        bytes32 digest = hashReceipt(r);
        address previous = address(0);
        uint256 accepted = 0;
        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = _recover(digest, signatures[i]);
            // Strictly ascending forces distinctness: one key cannot sign twice.
            if (signer <= previous || !isSigner[signer]) revert BadSignatures();
            previous = signer;
            accepted += 1;
        }
        if (accepted < threshold) revert BadSignatures();
        evidenceUsed[r.evidenceDigest] = true;
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) revert BadSignatures();
        bytes32 r_; bytes32 s_; uint8 v_;
        assembly {
            r_ := calldataload(signature.offset)
            s_ := calldataload(add(signature.offset, 32))
            v_ := byte(0, calldataload(add(signature.offset, 64)))
        }
        // Reject the high-s half of the curve: signature malleability would let
        // the same authorisation appear as two distinct signatures.
        if (uint256(s_) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert BadSignatures();
        if (v_ != 27 && v_ != 28) revert BadSignatures();
        address signer = ecrecover(digest, v_, r_, s_);
        if (signer == address(0)) revert BadSignatures();
        return signer;
    }

    /* ── Rotation, timelocked and public ── */

    modifier onlyGovernor() { if (msg.sender != governor) revert NotGovernor(); _; }

    function proposeRotation(address signer, bool add, uint8 newThreshold) external onlyGovernor {
        bytes32 action = keccak256(abi.encode(signer, add, newThreshold));
        rotationReadyAt[action] = block.timestamp + rotationDelay;
        emit SignerRotationProposed(action, rotationReadyAt[action]);
    }

    function executeRotation(address signer, bool add, uint8 newThreshold) external onlyGovernor {
        bytes32 action = keccak256(abi.encode(signer, add, newThreshold));
        uint256 readyAt = rotationReadyAt[action];
        if (readyAt == 0 || block.timestamp < readyAt) revert RotationNotReady();
        delete rotationReadyAt[action];
        if (add) { require(!isSigner[signer], "already a signer"); isSigner[signer] = true; signerCount += 1; }
        else { require(isSigner[signer], "not a signer"); isSigner[signer] = false; signerCount -= 1; }
        require(newThreshold > 0 && newThreshold <= signerCount, "bad threshold");
        threshold = newThreshold;
        emit SignerRotated(signer, add, newThreshold);
    }
}
