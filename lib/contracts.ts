import { type Address } from 'viem'

// Arc Testnet USDC (ERC-20, 6 decimals) — verified address from pop-CLAUDE.md
export const USDC = '0x3600000000000000000000000000000000000000' as const satisfies Address

export const POP_CONTRACT = process.env.NEXT_PUBLIC_POP_CONTRACT as `0x${string}`

export const erc20Abi = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// Copied from out/Pop.sol/Pop.json — never hand-written
export const popAbi = [
  { type: 'constructor', inputs: [{ name: '_usdc', type: 'address', internalType: 'address' }, { name: '_resolver', type: 'address', internalType: 'address' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'CHALLENGE_WINDOW', inputs: [], outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'MIN_CLAIM_TO_RESOLVE_GAP', inputs: [], outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'RESOLUTION_TIMEOUT', inputs: [], outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'USDC', inputs: [], outputs: [{ name: '', type: 'address', internalType: 'contract IERC20' }], stateMutability: 'view' },
  { type: 'function', name: 'acceptBet', inputs: [{ name: 'id', type: 'uint256', internalType: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function', name: 'bets',
    inputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      { name: 'creator', type: 'address', internalType: 'address' },
      { name: 'opponent', type: 'address', internalType: 'address' },
      { name: 'stake', type: 'uint128', internalType: 'uint128' },
      { name: 'joinDeadline', type: 'uint64', internalType: 'uint64' },
      { name: 'resolveAt', type: 'uint64', internalType: 'uint64' },
      { name: 'acceptedAt', type: 'uint64', internalType: 'uint64' },
      { name: 'proposedAt', type: 'uint64', internalType: 'uint64' },
      { name: 'definitionHash', type: 'bytes32', internalType: 'bytes32' },
      { name: 'evidenceHash', type: 'bytes32', internalType: 'bytes32' },
      { name: 'proposedWinner', type: 'address', internalType: 'address' },
      { name: 'creatorVote', type: 'address', internalType: 'address' },
      { name: 'opponentVote', type: 'address', internalType: 'address' },
      { name: 'status', type: 'uint8', internalType: 'enum Pop.Status' },
    ],
    stateMutability: 'view',
  },
  { type: 'function', name: 'cancelBet', inputs: [{ name: 'id', type: 'uint256', internalType: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'challenge', inputs: [{ name: 'id', type: 'uint256', internalType: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'claimExpired', inputs: [{ name: 'id', type: 'uint256', internalType: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'claimOpenBet', inputs: [{ name: 'id', type: 'uint256', internalType: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function', name: 'createBet',
    inputs: [
      { name: 'opponent', type: 'address', internalType: 'address' },
      { name: 'stake', type: 'uint128', internalType: 'uint128' },
      { name: 'definitionHash', type: 'bytes32', internalType: 'bytes32' },
      { name: 'joinDeadline', type: 'uint64', internalType: 'uint64' },
      { name: 'resolveAt', type: 'uint64', internalType: 'uint64' },
    ],
    outputs: [{ name: 'id', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'createOpenBet',
    inputs: [
      { name: 'stake', type: 'uint128', internalType: 'uint128' },
      { name: 'definitionHash', type: 'bytes32', internalType: 'bytes32' },
      { name: 'claimDeadline', type: 'uint64', internalType: 'uint64' },
      { name: 'resolveAt', type: 'uint64', internalType: 'uint64' },
    ],
    outputs: [{ name: 'id', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  { type: 'function', name: 'declineBet', inputs: [{ name: 'id', type: 'uint256', internalType: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'finalize', inputs: [{ name: 'id', type: 'uint256', internalType: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function', name: 'getBet',
    inputs: [{ name: 'id', type: 'uint256', internalType: 'uint256' }],
    outputs: [{
      name: '', type: 'tuple', internalType: 'struct Pop.Bet',
      components: [
        { name: 'creator', type: 'address', internalType: 'address' },
        { name: 'opponent', type: 'address', internalType: 'address' },
        { name: 'stake', type: 'uint128', internalType: 'uint128' },
        { name: 'joinDeadline', type: 'uint64', internalType: 'uint64' },
        { name: 'resolveAt', type: 'uint64', internalType: 'uint64' },
        { name: 'acceptedAt', type: 'uint64', internalType: 'uint64' },
        { name: 'proposedAt', type: 'uint64', internalType: 'uint64' },
        { name: 'definitionHash', type: 'bytes32', internalType: 'bytes32' },
        { name: 'evidenceHash', type: 'bytes32', internalType: 'bytes32' },
        { name: 'proposedWinner', type: 'address', internalType: 'address' },
        { name: 'creatorVote', type: 'address', internalType: 'address' },
        { name: 'opponentVote', type: 'address', internalType: 'address' },
        { name: 'status', type: 'uint8', internalType: 'enum Pop.Status' },
      ],
    }],
    stateMutability: 'view',
  },
  { type: 'function', name: 'nextId', inputs: [], outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }], stateMutability: 'view' },
  {
    type: 'function', name: 'proposeResolution',
    inputs: [
      { name: 'id', type: 'uint256', internalType: 'uint256' },
      { name: 'winner', type: 'address', internalType: 'address' },
      { name: 'evidenceHash', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  { type: 'function', name: 'resolver', inputs: [], outputs: [{ name: '', type: 'address', internalType: 'address' }], stateMutability: 'view' },
  {
    type: 'function', name: 'voidBet',
    inputs: [
      { name: 'id', type: 'uint256', internalType: 'uint256' },
      { name: 'evidenceHash', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'voteWinner',
    inputs: [{ name: 'id', type: 'uint256', internalType: 'uint256' }, { name: 'pickedWinner', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  { type: 'event', name: 'BetAccepted', inputs: [{ name: 'id', type: 'uint256', indexed: true, internalType: 'uint256' }], anonymous: false },
  { type: 'event', name: 'BetCancelled', inputs: [{ name: 'id', type: 'uint256', indexed: true, internalType: 'uint256' }], anonymous: false },
  { type: 'event', name: 'BetChallenged', inputs: [{ name: 'id', type: 'uint256', indexed: true, internalType: 'uint256' }, { name: 'by', type: 'address', indexed: true, internalType: 'address' }], anonymous: false },
  {
    type: 'event', name: 'BetCreated',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'creator', type: 'address', indexed: true, internalType: 'address' },
      { name: 'opponent', type: 'address', indexed: true, internalType: 'address' },
      { name: 'stake', type: 'uint128', indexed: false, internalType: 'uint128' },
      { name: 'joinDeadline', type: 'uint64', indexed: false, internalType: 'uint64' },
      { name: 'resolveAt', type: 'uint64', indexed: false, internalType: 'uint64' },
      { name: 'definitionHash', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
    anonymous: false,
  },
  { type: 'event', name: 'BetDeclined', inputs: [{ name: 'id', type: 'uint256', indexed: true, internalType: 'uint256' }], anonymous: false },
  { type: 'event', name: 'BetExpired', inputs: [{ name: 'id', type: 'uint256', indexed: true, internalType: 'uint256' }], anonymous: false },
  { type: 'event', name: 'BetResolved', inputs: [{ name: 'id', type: 'uint256', indexed: true, internalType: 'uint256' }, { name: 'winner', type: 'address', indexed: true, internalType: 'address' }, { name: 'pot', type: 'uint128', indexed: false, internalType: 'uint128' }], anonymous: false },
  {
    type: 'event', name: 'BetVoided',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'evidenceHash', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'OpenBetClaimed',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'claimant', type: 'address', indexed: true, internalType: 'address' },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'OpenBetPosted',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'creator', type: 'address', indexed: true, internalType: 'address' },
      { name: 'stake', type: 'uint128', indexed: false, internalType: 'uint128' },
      { name: 'claimDeadline', type: 'uint64', indexed: false, internalType: 'uint64' },
      { name: 'resolveAt', type: 'uint64', indexed: false, internalType: 'uint64' },
      { name: 'definitionHash', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
    anonymous: false,
  },
  { type: 'event', name: 'ResolutionProposed', inputs: [{ name: 'id', type: 'uint256', indexed: true, internalType: 'uint256' }, { name: 'proposedWinner', type: 'address', indexed: true, internalType: 'address' }, { name: 'evidenceHash', type: 'bytes32', indexed: false, internalType: 'bytes32' }], anonymous: false },
  { type: 'event', name: 'VoteCast', inputs: [{ name: 'id', type: 'uint256', indexed: true, internalType: 'uint256' }, { name: 'voter', type: 'address', indexed: true, internalType: 'address' }, { name: 'pickedWinner', type: 'address', indexed: false, internalType: 'address' }], anonymous: false },
  { type: 'error', name: 'AlreadyVoted', inputs: [] },
  { type: 'error', name: 'ClaimWindowClosed', inputs: [] },
  { type: 'error', name: 'GapTooShort', inputs: [] },
  { type: 'error', name: 'InvalidWinner', inputs: [] },
  { type: 'error', name: 'NotOpen', inputs: [] },
  { type: 'error', name: 'NotParticipant', inputs: [] },
  { type: 'error', name: 'NotResolver', inputs: [] },
  { type: 'error', name: 'PastDeadline', inputs: [] },
  { type: 'error', name: 'ReentrancyGuardReentrantCall', inputs: [] },
  { type: 'error', name: 'SafeERC20FailedOperation', inputs: [{ name: 'token', type: 'address', internalType: 'address' }] },
  { type: 'error', name: 'SeatTaken', inputs: [] },
  { type: 'error', name: 'TooEarly', inputs: [] },
  { type: 'error', name: 'WindowClosed', inputs: [] },
  { type: 'error', name: 'WindowOpen', inputs: [] },
  { type: 'error', name: 'WrongStatus', inputs: [] },
] as const

export const BET_STATUS = ['Pending', 'Locked', 'Proposed', 'Resolved', 'Disputed', 'Cancelled', 'Expired', 'Open', 'Voided'] as const
export type BetStatus = (typeof BET_STATUS)[number]
// abandoned v1: 0xa85D117afc00DDc9F8BD90b88dD6d4c9c47015D6
