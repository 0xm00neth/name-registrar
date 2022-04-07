//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title NameRegistrar
 * @author Jason Kwon
 * @notice users can register name and renew it
 */
contract NameRegistrar is Ownable {
    /// @dev user => commitment hash
    mapping(address => bytes32) private commits;

    /// @dev name => owner
    mapping(string => address) private registered;

    /// @dev name => expiresAt timestamp
    mapping(string => uint256) private expiresAt;

    /// @dev user => name
    mapping(address => string) public names;

    /// @dev user => has ETH locked in the contract
    mapping(address => bool) public locked;

    /// @dev user => last interaction block number
    mapping(address => uint256) private blockNo;

    /// @dev 0.01 ETH fee per character
    uint256 public constant PRICE_PER_CHAR = 0.01 ether;

    /// @dev locks 0.5 ETH when registering name
    uint256 public constant LOCK_AMOUNT = 0.5 ether;

    /// @dev locks for 10 days
    uint256 public constant LOCK_PERIOD = 10 * 24 * 60 * 60;

    /// @dev restrict gas price to 200 gwei to prevent front-running
    uint256 public constant MAX_GAS_PRICE = 200e9;

    event Registered(address owner, string name, uint256 expiresAt);
    event ReNewed(address owner, string name, uint256 expiresAt);

    modifier onePerBlock() {
        require(
            blockNo[msg.sender] < block.number,
            "can not run in same block"
        );
        blockNo[msg.sender] = block.number;
        _;
    }

    modifier restrictGas() {
        require(tx.gasprice <= MAX_GAS_PRICE, "gasprice too high");
        _;
    }

    /**
     * @notice commit hash to register name
     * @dev stores hash and checks later in reveal()
     * @param hash commitment hash
     */
    function commit(bytes32 hash) public onePerBlock restrictGas {
        commits[msg.sender] = hash;
    }

    /**
     * @notice reveal & register name
     * @dev reveal commited hash and register user a name
     * user should not have named already registered or the registered name should be expired
     * name registration fee = name length * PRICE_PER_CHAR
     * locks LOCK_AMOUNT for LOCK_PERIOD
     * registered name can be renewed before it gets expired
     * emits Registered events upon successful registration
     * @param nonce random number to secure hash
     * @param name name, length must have 3 or more characters
     */
    function reveal(uint256 nonce, string memory name)
        public
        payable
        onePerBlock
        restrictGas
    {
        require(bytes(name).length > 2, "name too short");

        bytes32 d = digest(nonce, name, msg.sender);
        require(commits[msg.sender] == d, "invalid data");
        require(
            registered[name] == address(0) || expiresAt[name] > block.timestamp,
            "already registered"
        );
        uint256 fee = bytes(name).length * PRICE_PER_CHAR;
        require(
            msg.value == (fee + LOCK_AMOUNT),
            "insufficient fee and lock amount"
        );

        string memory oldName = names[msg.sender];
        require(
            bytes(oldName).length == 0 || expiresAt[oldName] > block.timestamp,
            "user already have name"
        );

        registered[name] = msg.sender;
        names[msg.sender] = name;

        if (locked[msg.sender]) {
            locked[msg.sender] = false; // reset to false to prevent reentrancy attack
            transferETH(payable(msg.sender), LOCK_AMOUNT);
        }
        locked[msg.sender] = true;

        expiresAt[name] = block.timestamp + LOCK_PERIOD;

        emit Registered(msg.sender, name, expiresAt[name]);
    }

    /**
     * @notice renew registered name
     * @dev name should be registered and not expired
     * resets expiresAt value
     * emits ReNewed event upon successful renewal
     * @param name name
     */
    function renew(string memory name) public {
        require(
            registered[name] == msg.sender &&
                expiresAt[name] <= block.timestamp,
            "not registered or already expired"
        );
        expiresAt[name] = block.timestamp + LOCK_PERIOD;

        emit ReNewed(msg.sender, name, expiresAt[name]);
    }

    /**
     * @notice generates hash from nonce, name, sender
     * @dev hash = keccak256(abi.encodePacked(nonce, name, sender))
     * @param nonce random number
     * @param name name
     * @param sender user address
     * @return bytes32 generated hash
     */
    function digest(
        uint256 nonce,
        string memory name,
        address sender
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(nonce, name, sender));
    }

    /**
     * @notice unlock balance from the registrar
     * @dev refunds user the locked balance for name registration
     */
    function unlockBalance() external {
        string memory name = names[msg.sender];
        require(bytes(name).length > 2, "no name registered");
        require(expiresAt[name] <= block.timestamp, "name not expired yet");
        require(locked[msg.sender], "already unlocked balance");
        locked[msg.sender] = false;

        transferETH(payable(msg.sender), LOCK_AMOUNT);
    }

    /**
     * @notice withdraw fees from the contract
     */
    function withdrawETH() external onlyOwner {
        uint256 bal = address(this).balance;
        transferETH(payable(msg.sender), bal);
    }

    /**
     * @notice returns user's registered name
     * @dev if the name is expired, returns ""
     * @return string user's registered name
     */
    function getName(address user) public view returns (string memory) {
        string memory name = names[user];
        if (bytes(name).length > 2 && expiresAt[name] <= block.timestamp) {
            return name;
        }
        return "";
    }

    /**
     * @dev transfers user ETH
     * @param user address to send ETH to
     * @param amount amount to send
     */
    function transferETH(address payable user, uint256 amount) internal {
        require(user.send(amount), "failed to transfer ETH");
    }
}
