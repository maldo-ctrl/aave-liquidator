import { isTradeBetter } from './utils/trades'
import { ChainId, Currency, CurrencyAmount, Pair, Token, Trade } from '@uniswap/sdk'
import flatMap from 'lodash.flatmap'

import { BASES_TO_CHECK_TRADES_AGAINST, CUSTOM_BASES, BETTER_TRADE_LESS_HOPS_THRESHOLD } from './constants'
import { PairState, usePairs } from './data/Reserves'
import { wrappedCurrency } from './utils/wrappedCurrency'

//import { useUnsupportedTokens } from './Tokens'

export function useAllCommonPairs(currencyA?: Currency, currencyB?: Currency): Pair[] {
  const chainId = ChainId.MAINNET

  const bases: Token[] = chainId ? BASES_TO_CHECK_TRADES_AGAINST[chainId] : []

  const [tokenA, tokenB] = chainId
    ? [wrappedCurrency(currencyA, chainId), wrappedCurrency(currencyB, chainId)]
    : [undefined, undefined]

  const basePairs: [Token, Token][] =
      flatMap(bases, (base): [Token, Token][] => bases.map(otherBase => [base, otherBase])).filter(
        ([t0, t1]) => t0.address !== t1.address
      )

  const allPairCombinations: [Token, Token][] =
    tokenA && tokenB
      ? [
          // the direct pair
          [tokenA, tokenB],
          // token A against all bases
          ...bases.map((base): [Token, Token] => [tokenA, base]),
          // token B against all bases
          ...bases.map((base): [Token, Token] => [tokenB, base]),
          // each base against all bases
          ...basePairs
        ]
          .filter((tokens): tokens is [Token, Token] => Boolean(tokens[0] && tokens[1]))
          .filter(([t0, t1]) => t0.address !== t1.address)
          .filter(([tokenA, tokenB]) => {
            if (!chainId) return true
            const customBases = CUSTOM_BASES[chainId]
            if (!customBases) return true

            const customBasesA: Token[] | undefined = customBases[tokenA.address]
            const customBasesB: Token[] | undefined = customBases[tokenB.address]

            if (!customBasesA && !customBasesB) return true

            if (customBasesA && !customBasesA.find(base => tokenB.equals(base))) return false
            if (customBasesB && !customBasesB.find(base => tokenA.equals(base))) return false

            return true
          })
      : []
  console.log(allPairCombinations.toString)
  const allPairs = usePairs(allPairCombinations)

  // only pass along valid pairs, non-duplicated pairs
  return Object.values(
      allPairs
        // filter out invalid pairs
        .filter((result): result is [PairState.EXISTS, Pair] => Boolean(result[0] === PairState.EXISTS && result[1]))
        // filter out duplicated pairs
        .reduce<{ [pairAddress: string]: Pair }>((memo, [, curr]) => {
          memo[curr.liquidityToken.address] = memo[curr.liquidityToken.address] ?? curr
          return memo
        }, {})
    )
}

const MAX_HOPS = 3

/**
 * Returns the best trade for the exact amount of tokens in to the given token out
 */
export function useTradeExactIn(currencyAmountIn?: CurrencyAmount, currencyOut?: Currency): Trade | null {
  const allowedPairs = useAllCommonPairs(currencyAmountIn?.currency, currencyOut)

  const singleHopOnly = false

  if (currencyAmountIn && currencyOut && allowedPairs.length > 0) {
    if (singleHopOnly) {
      return (
        Trade.bestTradeExactIn(allowedPairs, currencyAmountIn, currencyOut, { maxHops: 1, maxNumResults: 1 })[0] ??
        null
      )
    }
    // search through trades with varying hops, find best trade out of them
    let bestTradeSoFar: Trade | null = null
    for (let i = 1; i <= MAX_HOPS; i++) {
      const currentTrade: Trade | null =
        Trade.bestTradeExactIn(allowedPairs, currencyAmountIn, currencyOut, { maxHops: i, maxNumResults: 1 })[0] ??
        null
      // if current trade is best yet, save it
      if (isTradeBetter(bestTradeSoFar, currentTrade, BETTER_TRADE_LESS_HOPS_THRESHOLD)) {
        bestTradeSoFar = currentTrade
      }
    }
    return bestTradeSoFar
  }

  return null
}

/**
 * Returns the best trade for the token in to the exact amount of token out
 */
export function useTradeExactOut(currencyIn?: Currency, currencyAmountOut?: CurrencyAmount): Trade | null {
  const allowedPairs = useAllCommonPairs(currencyIn, currencyAmountOut?.currency)

  const singleHopOnly = false

    if (currencyIn && currencyAmountOut && allowedPairs.length > 0) {
      if (singleHopOnly) {
        return (
          Trade.bestTradeExactOut(allowedPairs, currencyIn, currencyAmountOut, { maxHops: 1, maxNumResults: 1 })[0] ??
          null
        )
      }
      // search through trades with varying hops, find best trade out of them
      let bestTradeSoFar: Trade | null = null
      for (let i = 1; i <= MAX_HOPS; i++) {
        const currentTrade =
          Trade.bestTradeExactOut(allowedPairs, currencyIn, currencyAmountOut, { maxHops: i, maxNumResults: 1 })[0] ??
          null
        if (isTradeBetter(bestTradeSoFar, currentTrade, BETTER_TRADE_LESS_HOPS_THRESHOLD)) {
          bestTradeSoFar = currentTrade
        }
      }
      return bestTradeSoFar
    }
    return null

}
/*
export function useIsTransactionUnsupported(currencyIn?: Currency, currencyOut?: Currency): boolean {
  const unsupportedToken: { [address: string]: Token } = useUnsupportedTokens()
  const chainId = ChainId.MAINNET

  const tokenIn = wrappedCurrency(currencyIn, chainId)
  const tokenOut = wrappedCurrency(currencyOut, chainId)

  // if unsupported list loaded & either token on list, mark as unsupported
  if (unsupportedToken) {
    if (tokenIn && Object.keys(unsupportedToken).includes(tokenIn.address)) {
      return true
    }
    if (tokenOut && Object.keys(unsupportedToken).includes(tokenOut.address)) {
      return true
    }
  }

  return false
}
*/
