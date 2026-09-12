// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {HuskyAgentERC20} from "./HuskyAgentERC20.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IHuskyAgentPair} from "./interfaces/IHuskyAgentPair.sol";
import {Math} from "./libraries/Math.sol";

/// @notice Constant-product (x*y=k) pool for two ERC-20 tokens. The pair contract
/// itself is the LP token. No flash-swap callback, no price accumulators, no
/// permit — out of scope for v1 (see docs/02-contracts-spec.md).
contract HuskyAgentPair is HuskyAgentERC20, IHuskyAgentPair {
    uint256 public constant MINIMUM_LIQUIDITY = 1000;
    /// @dev Swap fee = SWAP_FEE_NUMERATOR / FEE_DENOMINATOR = 3/1000 = 0.30%.
    /// Deliberately matches Uniswap V2's exact scale (not a finer-grained bps
    /// scale): the K-invariant check below squares balance*FEE_DENOMINATOR, and
    /// a larger denominator (e.g. 1_000_000) overflows uint256 at reserves near
    /// the uint112 ceiling. 1000 keeps the same overflow headroom V2 relies on.
    uint256 private constant SWAP_FEE_NUMERATOR = 3;
    uint256 private constant FEE_DENOMINATOR = 1000;

    address public factory;
    address public token0;
    address public token1;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    uint256 private unlocked = 1;

    modifier lock() {
        require(unlocked == 1, "HuskyAgentPair: LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor() {
        factory = msg.sender;
    }

    /// @dev Called once by the factory at deployment time.
    function initialize(address _token0, address _token1) external {
        require(msg.sender == factory, "HuskyAgentPair: FORBIDDEN");
        token0 = _token0;
        token1 = _token1;
    }

    function getReserves() public view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    function _update(uint256 balance0, uint256 balance1) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, "HuskyAgentPair: OVERFLOW");
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = uint32(block.timestamp % 2 ** 32);
        emit Sync(reserve0, reserve1);
    }

    /// @notice Mints LP tokens for the liquidity implicitly deposited by the
    /// caller (tokens must already be transferred to this contract).
    function mint(address to) external lock returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        uint256 _totalSupply = totalSupply;
        if (_totalSupply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0xdead), MINIMUM_LIQUIDITY);
        } else {
            liquidity = Math.min((amount0 * _totalSupply) / _reserve0, (amount1 * _totalSupply) / _reserve1);
        }
        require(liquidity > 0, "HuskyAgentPair: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);

        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    /// @notice Burns LP tokens held by this contract and returns the
    /// corresponding share of both reserves to `to`.
    function burn(address to) external lock returns (uint256 amount0, uint256 amount1) {
        address _token0 = token0;
        address _token1 = token1;
        uint256 balance0 = IERC20(_token0).balanceOf(address(this));
        uint256 balance1 = IERC20(_token1).balanceOf(address(this));
        uint256 liquidity = balanceOf[address(this)];

        uint256 _totalSupply = totalSupply;
        amount0 = (liquidity * balance0) / _totalSupply;
        amount1 = (liquidity * balance1) / _totalSupply;
        require(amount0 > 0 && amount1 > 0, "HuskyAgentPair: INSUFFICIENT_LIQUIDITY_BURNED");

        _burn(address(this), liquidity);
        require(IERC20(_token0).transfer(to, amount0), "HuskyAgentPair: TRANSFER_FAILED");
        require(IERC20(_token1).transfer(to, amount1), "HuskyAgentPair: TRANSFER_FAILED");

        balance0 = IERC20(_token0).balanceOf(address(this));
        balance1 = IERC20(_token1).balanceOf(address(this));
        _update(balance0, balance1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    /// @notice Optimistically sends `amountXOut` of each token to `to`, then
    /// verifies the constant-product invariant (net of the swap fee) held.
    /// Expects the input token to have already been transferred in by the
    /// router before calling.
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external lock {
        require(amount0Out > 0 || amount1Out > 0, "HuskyAgentPair: INSUFFICIENT_OUTPUT_AMOUNT");
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        require(amount0Out < _reserve0 && amount1Out < _reserve1, "HuskyAgentPair: INSUFFICIENT_LIQUIDITY");

        address _token0 = token0;
        address _token1 = token1;
        require(to != _token0 && to != _token1, "HuskyAgentPair: INVALID_TO");

        if (amount0Out > 0) require(IERC20(_token0).transfer(to, amount0Out), "HuskyAgentPair: TRANSFER_FAILED");
        if (amount1Out > 0) require(IERC20(_token1).transfer(to, amount1Out), "HuskyAgentPair: TRANSFER_FAILED");

        uint256 balance0 = IERC20(_token0).balanceOf(address(this));
        uint256 balance1 = IERC20(_token1).balanceOf(address(this));

        uint256 amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "HuskyAgentPair: INSUFFICIENT_INPUT_AMOUNT");

        {
            uint256 balance0Adjusted = balance0 * FEE_DENOMINATOR - amount0In * SWAP_FEE_NUMERATOR;
            uint256 balance1Adjusted = balance1 * FEE_DENOMINATOR - amount1In * SWAP_FEE_NUMERATOR;
            require(
                balance0Adjusted * balance1Adjusted
                    >= uint256(_reserve0) * uint256(_reserve1) * (FEE_DENOMINATOR ** 2),
                "HuskyAgentPair: K"
            );
        }

        _update(balance0, balance1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    /// @notice Forces reserves to match current balances (recovery helper if a
    /// token was sent directly to the pair rather than via the router).
    function sync() external lock {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)));
    }
}
