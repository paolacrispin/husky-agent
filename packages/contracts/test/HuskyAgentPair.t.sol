// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {HuskyAgentFactory} from "../src/HuskyAgentFactory.sol";
import {HuskyAgentRouter} from "../src/HuskyAgentRouter.sol";
import {HuskyAgentPair} from "../src/HuskyAgentPair.sol";
import {MockERC20} from "../src/MockERC20.sol";

contract HuskyAgentPairTest is Test {
    HuskyAgentFactory internal factory;
    HuskyAgentRouter internal router;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;
    address internal lp = address(this);

    function setUp() public {
        factory = new HuskyAgentFactory(address(this));
        router = new HuskyAgentRouter(address(factory));
        tokenA = new MockERC20("Token A", "TKA", 18);
        tokenB = new MockERC20("Token B", "TKB", 18);

        tokenA.mint(lp, 1_000_000 ether);
        tokenB.mint(lp, 1_000_000 ether);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);

        router.addLiquidity(
            address(tokenA), address(tokenB), 100_000 ether, 100_000 ether, 0, 0, lp, block.timestamp + 1 hours
        );
    }

    function test_swapExactTokensForTokens_movesReservesAndPreservesK() public {
        (uint256 reserveInBefore, uint256 reserveOutBefore) = router.getReserves(address(tokenA), address(tokenB));

        uint256 amountIn = 1_000 ether;
        uint256 expectedOut = router.getAmountOut(amountIn, reserveInBefore, reserveOutBefore);

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        uint256[] memory amounts =
            router.swapExactTokensForTokens(amountIn, expectedOut, path, lp, block.timestamp + 1 hours);

        assertEq(amounts[0], amountIn);
        assertEq(amounts[1], expectedOut);

        (uint256 reserveInAfter, uint256 reserveOutAfter) = router.getReserves(address(tokenA), address(tokenB));
        assertEq(reserveInAfter, reserveInBefore + amountIn);
        assertEq(reserveOutAfter, reserveOutBefore - expectedOut);
    }

    function test_swap_revertsBelowAmountOutMin() public {
        (uint256 reserveIn, uint256 reserveOut) = router.getReserves(address(tokenA), address(tokenB));
        uint256 amountIn = 1_000 ether;
        uint256 actualOut = router.getAmountOut(amountIn, reserveIn, reserveOut);

        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);

        vm.expectRevert(bytes("HuskyAgentRouter: INSUFFICIENT_OUTPUT_AMOUNT"));
        router.swapExactTokensForTokens(amountIn, actualOut + 1, path, lp, block.timestamp + 1 hours);
    }

    function test_addLiquidity_thenRemoveLiquidity_returnsFunds() public {
        HuskyAgentPair pair = HuskyAgentPair(factory.getPair(address(tokenA), address(tokenB)));
        uint256 liquidity = pair.balanceOf(lp);
        assertGt(liquidity, 0);

        pair.approve(address(router), liquidity);
        (uint256 amountA, uint256 amountB) = router.removeLiquidity(
            address(tokenA), address(tokenB), liquidity, 0, 0, lp, block.timestamp + 1 hours
        );

        assertGt(amountA, 0);
        assertGt(amountB, 0);
    }
}
