// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IHuskyAgentFactory} from "./interfaces/IHuskyAgentFactory.sol";
import {IHuskyAgentPair} from "./interfaces/IHuskyAgentPair.sol";
import {Math} from "./libraries/Math.sol";

/// @notice Stateless entry point for the AMM. Holds no funds between calls.
/// Direct pairs only for v1 — no multi-hop (see docs/02-contracts-spec.md).
contract HuskyAgentRouter {
    address public immutable factory;

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "HuskyAgentRouter: EXPIRED");
        _;
    }

    constructor(address _factory) {
        factory = _factory;
    }

    function _pairFor(address tokenA, address tokenB) internal view returns (address pair) {
        pair = IHuskyAgentFactory(factory).getPair(tokenA, tokenB);
        require(pair != address(0), "HuskyAgentRouter: PAIR_NOT_FOUND");
    }

    function _sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    /// @notice Constant-product quote: how much of the other asset `amountA`
    /// is worth at the current reserves, with no fee applied (used for
    /// proportional liquidity math, not swap pricing).
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) public pure returns (uint256 amountB) {
        require(amountA > 0, "HuskyAgentRouter: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "HuskyAgentRouter: INSUFFICIENT_LIQUIDITY");
        amountB = (amountA * reserveB) / reserveA;
    }

    /// @notice Constant-product swap output, net of the pair's 0.30% fee.
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public
        pure
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "HuskyAgentRouter: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "HuskyAgentRouter: INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 1000 + amountInWithFee;
        amountOut = numerator / denominator;
    }

    function getReserves(address tokenA, address tokenB)
        public
        view
        returns (uint256 reserveA, uint256 reserveB)
    {
        (address token0,) = _sortTokens(tokenA, tokenB);
        (uint112 reserve0, uint112 reserve1,) = IHuskyAgentPair(_pairFor(tokenA, tokenB)).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    /// @notice Adds liquidity to the tokenA/tokenB pair, creating it via the
    /// factory first if it doesn't exist yet.
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        address pair = IHuskyAgentFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) {
            pair = IHuskyAgentFactory(factory).createPair(tokenA, tokenB);
        }

        (uint256 reserveA, uint256 reserveB) = getReserves(tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "HuskyAgentRouter: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = quote(amountBDesired, reserveB, reserveA);
                require(amountAOptimal <= amountADesired, "HuskyAgentRouter: EXCESSIVE_A_AMOUNT");
                require(amountAOptimal >= amountAMin, "HuskyAgentRouter: INSUFFICIENT_A_AMOUNT");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }

        require(IERC20(tokenA).transferFrom(msg.sender, pair, amountA), "HuskyAgentRouter: TRANSFER_FAILED");
        require(IERC20(tokenB).transferFrom(msg.sender, pair, amountB), "HuskyAgentRouter: TRANSFER_FAILED");
        liquidity = IHuskyAgentPair(pair).mint(to);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = _pairFor(tokenA, tokenB);
        require(IHuskyAgentPair(pair).transferFrom(msg.sender, pair, liquidity), "HuskyAgentRouter: TRANSFER_FAILED");
        (uint256 amount0, uint256 amount1) = IHuskyAgentPair(pair).burn(to);
        (address token0,) = _sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, "HuskyAgentRouter: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "HuskyAgentRouter: INSUFFICIENT_B_AMOUNT");
    }

    /// @notice Direct-pair-only swap: sells an exact `amountIn` of `path[0]`
    /// for at least `amountOutMin` of `path[1]`. `path` must have length 2 —
    /// multi-hop is out of scope for v1.
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(path.length == 2, "HuskyAgentRouter: MULTI_HOP_UNSUPPORTED");
        address tokenIn = path[0];
        address tokenOut = path[1];
        address pair = _pairFor(tokenIn, tokenOut);

        (uint256 reserveIn, uint256 reserveOut) = getReserves(tokenIn, tokenOut);
        uint256 amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
        require(amountOut >= amountOutMin, "HuskyAgentRouter: INSUFFICIENT_OUTPUT_AMOUNT");

        require(IERC20(tokenIn).transferFrom(msg.sender, pair, amountIn), "HuskyAgentRouter: TRANSFER_FAILED");

        (address token0,) = _sortTokens(tokenIn, tokenOut);
        (uint256 amount0Out, uint256 amount1Out) = tokenIn == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
        IHuskyAgentPair(pair).swap(amount0Out, amount1Out, to);

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;
    }
}
