pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";


contract WorldPhysicsFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;
    uint256 public cooldownSeconds = 60; // Default cooldown: 60 seconds

    bool public paused;

    struct Batch {
        uint256 id;
        bool open;
        euint32 totalMagicEnergy;
        euint32 totalAntiMagicEnergy;
        euint32 totalGravityFactor;
        uint256 experimentCount;
    }
    uint256 public currentBatchId;
    mapping(uint256 => Batch) public batches;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    // Custom Errors
    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosed();
    error InvalidBatch();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidParameter();
    error NotInitialized();

    // Events
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address account);
    event Unpaused(address account);
    event CooldownSet(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId, uint256 experimentCount);
    event ExperimentSubmitted(address indexed provider, uint256 indexed batchId, uint256 experimentCount);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 totalMagicEnergy, uint256 totalAntiMagicEnergy, uint256 totalGravityFactor);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
        lastSubmissionTime[msg.sender] = block.timestamp;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier submissionRateLimited() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier decryptionRateLimited() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
        lastDecryptionRequestTime[msg.sender] = block.timestamp;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true; // Owner is a provider by default
        emit ProviderAdded(owner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (isProvider[provider]) revert InvalidParameter();
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) revert InvalidParameter();
        if (provider == owner) revert InvalidParameter(); // Owner cannot be removed as provider this way
        isProvider[provider] = false;
        emit ProviderRemoved(provider);
    }

    function setPaused(bool _paused) external onlyOwner {
        if (_paused == paused) revert InvalidParameter();
        paused = _paused;
        if (_paused) {
            emit Paused(msg.sender);
        } else {
            emit Unpaused(msg.sender);
        }
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        if (newCooldownSeconds == cooldownSeconds) revert InvalidParameter();
        uint256 oldCooldownSeconds = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSet(oldCooldownSeconds, newCooldownSeconds);
    }

    function openBatch() external onlyOwner whenNotPaused {
        currentBatchId++;
        batches[currentBatchId] = Batch({
            id: currentBatchId,
            open: true,
            totalMagicEnergy: FHE.asEuint32(0),
            totalAntiMagicEnergy: FHE.asEuint32(0),
            totalGravityFactor: FHE.asEuint32(0),
            experimentCount: 0
        });
        emit BatchOpened(currentBatchId);
    }

    function closeBatch(uint256 batchId) external onlyOwner whenNotPaused {
        if (batchId != currentBatchId) revert InvalidBatch();
        Batch storage batch = batches[batchId];
        if (!batch.open) revert BatchClosed();
        batch.open = false;
        emit BatchClosed(batchId, batch.experimentCount);
    }

    function submitExperiment(
        uint256 batchId,
        euint32 magicEnergy,
        euint32 antiMagicEnergy,
        euint32 gravityFactor
    ) external onlyProvider whenNotPaused submissionRateLimited {
        if (batchId != currentBatchId) revert InvalidBatch();
        Batch storage batch = batches[batchId];
        if (!batch.open) revert BatchClosed();

        _initIfNeeded(magicEnergy);
        _initIfNeeded(antiMagicEnergy);
        _initIfNeeded(gravityFactor);

        batch.totalMagicEnergy = FHE.add(batch.totalMagicEnergy, magicEnergy);
        batch.totalAntiMagicEnergy = FHE.add(batch.totalAntiMagicEnergy, antiMagicEnergy);
        batch.totalGravityFactor = FHE.add(batch.totalGravityFactor, gravityFactor);
        batch.experimentCount++;

        emit ExperimentSubmitted(msg.sender, batchId, batch.experimentCount);
    }

    function requestBatchDecryption(uint256 batchId) external onlyOwner whenNotPaused decryptionRateLimited {
        if (batchId > currentBatchId) revert InvalidBatch();
        Batch storage batch = batches[batchId];
        if (batch.open) revert InvalidBatch(); // Cannot decrypt an open batch

        euint32[3] memory cts = [
            batch.totalMagicEnergy,
            batch.totalAntiMagicEnergy,
            batch.totalGravityFactor
        ];
        bytes32 stateHash = _hashCiphertexts(cts);

        uint256 requestId = FHE.requestDecryption({ cts: _toBytes32Array(cts), callbackSelector: this.myCallback.selector });
        decryptionContexts[requestId] = DecryptionContext({ batchId: batchId, stateHash: stateHash, processed: false });

        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();
        // Security: Replay protection prevents processing the same requestId multiple times.

        DecryptionContext storage ctx = decryptionContexts[requestId];
        Batch storage batch = batches[ctx.batchId];

        // Security: Rebuild ciphertexts from current contract state in the exact same order
        // as they were when the decryption was requested. This ensures that the state
        // of the data being decrypted has not changed since the request.
        euint32[3] memory currentCts = [
            batch.totalMagicEnergy,
            batch.totalAntiMagicEnergy,
            batch.totalGravityFactor
        ];
        bytes32 currentStateHash = _hashCiphertexts(currentCts);

        if (currentStateHash != ctx.stateHash) revert StateMismatch();

        FHE.checkSignatures(requestId, cleartexts, proof);

        // Security: If all checks pass, decode cleartexts in the same order.
        // The cleartexts are expected to be 3x uint256 values.
        uint256 totalMagicEnergy = abi.decode(cleartexts, (uint256));
        cleartexts = cleartexts[32:];
        uint256 totalAntiMagicEnergy = abi.decode(cleartexts, (uint256));
        cleartexts = cleartexts[32:];
        uint256 totalGravityFactor = abi.decode(cleartexts, (uint256));

        ctx.processed = true;
        emit DecryptionCompleted(requestId, ctx.batchId, totalMagicEnergy, totalAntiMagicEnergy, totalGravityFactor);
    }

    function _hashCiphertexts(euint32[3] memory cts) internal pure returns (bytes32) {
        bytes32[3] memory ctsAsBytes;
        for (uint i = 0; i < 3; i++) {
            ctsAsBytes[i] = FHE.toBytes32(cts[i]);
        }
        return keccak256(abi.encode(ctsAsBytes, address(this)));
    }

    function _toBytes32Array(euint32[3] memory cts) internal pure returns (bytes32[3] memory) {
        bytes32[3] memory result;
        for (uint i = 0; i < 3; i++) {
            result[i] = FHE.toBytes32(cts[i]);
        }
        return result;
    }

    function _initIfNeeded(euint32 val) internal {
        if (!FHE.isInitialized(val)) revert NotInitialized();
    }

    function _requireInitialized(euint32 val) internal view {
        if (!FHE.isInitialized(val)) revert NotInitialized();
    }
}