import { ethers, waffle, network } from 'hardhat'
import hre from 'hardhat'
// import { BigNumber, bigNumberify } from 'hardhat'
import { Signer, utils, Contract, BigNumber } from 'ethers'
import { expect } from 'chai'

const erc20Abi = [
  'function balanceOf(address owner) view returns (uint)',
  'function transfer(address to, uint amount)',
  'function approve(address spender, uint256 value) external returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint amount)'
]
const a16zAddress = '0x05E793cE0C6027323Ac150F6d45C2344d28B6019'

describe('UniswapV2TradingRoute', function() {
  const provider = waffle.provider
  const [wallet1, wallet2, wallet3, wallet4, other] = provider.getWallets()

  before(async function() {
    const Route = await ethers.getContractFactory('UniswapV2TradingRoute')
    this.route = await Route.deploy()
    await this.route.deployed()

    this.daiAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
    this.ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
    this.mkrAddress = '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2'

    this.dai = await ethers.getContractAt(erc20Abi, this.daiAddress)
    this.mkr = await ethers.getContractAt(erc20Abi, this.mkrAddress)

    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [a16zAddress]}
    )
  })

  it('Should initial data correctly', async function() {
    expect(await this.route.router()).to.properAddress
    expect(await this.route.etherERC20()).to.properAddress
    expect(await this.route.wETH()).to.properAddress

    expect(await this.route.router()).to.equal('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D')
    expect(await this.route.etherERC20()).to.equal(this.ethAddress)
    expect(await this.route.wETH()).to.equal('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2')
    expect(await this.route.amountOutMin()).to.equal('1')
    expect(await this.route.deadline()).to.equal(ethers.constants.MaxUint256)
  })

  it('Should emit Trade event properly', async function () {
    const intAmount = utils.parseEther('1')
    let outAmount: BigNumber = await this.route.getDestinationReturnAmount(this.ethAddress, this.daiAddress, intAmount)

    await expect(await this.route.trade(
      this.ethAddress,
      this.daiAddress,
      intAmount,
      {
        value: intAmount
      }
    ))
    .to.emit(this.route, 'Trade')
    .withArgs(this.ethAddress, intAmount, this.daiAddress, outAmount)
  })

  it('Should trade 1 ETH -> DAI correctly', async function() {
    const intAmount = utils.parseEther('1')
    let outAmount: BigNumber = await this.route.getDestinationReturnAmount(this.ethAddress, this.daiAddress, intAmount)
    console.log('1 ETH -> ? DAI', utils.formatUnits(outAmount, 18))

    await expect(() => this.route.trade(
      this.ethAddress,
      this.daiAddress,
      intAmount,
      {
        value: intAmount
      }
    ))
    .to.changeTokenBalance(this.dai, wallet1, outAmount)

    await expect(() =>  this.route.trade(
      this.ethAddress,
      this.daiAddress,
      intAmount,
      {
        value: intAmount
      }
    ))
    .to.changeEtherBalance(wallet1, '-1000000000000000000')
  })

  it('Should not allow trade 1 ETH -> DAI when provide incorrect amount int', async function() {
    await expect(this.route.trade(
      this.ethAddress,
      this.daiAddress,
      utils.parseEther('1'),
      {
        value: utils.parseEther('0.5')
      }
    ))
    .to.revertedWith('source amount mismatch')

    await expect(this.route.trade(
      this.ethAddress,
      this.daiAddress,
      utils.parseEther('0.5'),
      {
        value: utils.parseEther('1')
      }
    ))
    .to.revertedWith('source amount mismatch')
  })

  it('Should not allow trade 1 MKR -> ETH if balance is not enough', async function() {
    const intAmount = utils.parseEther('1')

    await expect(this.route.trade(
      this.mkrAddress,
      this.ethAddress,
      intAmount
    ))
    .to.be.reverted
  })

  it('Should not allow trade 1 MKR -> MKR', async function() {
    const intAmount = utils.parseEther('1')

    await expect(this.route.trade(
      this.mkrAddress,
      this.mkrAddress,
      intAmount
    ))
    .to.be.revertedWith('destination token can not be source token')
  })

  it('Should trade 1 MKR -> DAI correctly', async function() {
    const intAmount = utils.parseEther('1')
    let outAmount: BigNumber = await this.route.getDestinationReturnAmount(this.mkrAddress, this.daiAddress, intAmount)
    console.log('1 MKR -> ? DAI', utils.formatUnits(outAmount, 18))

    const trader = await ethers.provider.getSigner(a16zAddress)

    await this.mkr.connect(trader).approve(this.route.address, ethers.constants.MaxUint256)
    await expect(() =>  this.route.connect(trader).trade(
      this.mkrAddress,
      this.daiAddress,
      intAmount
    ))
    .to.changeTokenBalance(this.dai, trader, outAmount)

    await expect(() =>  this.route.connect(trader).trade(
      this.mkrAddress,
      this.daiAddress,
      intAmount
    ))
    .to.changeTokenBalance(this.mkr, trader, '-1000000000000000000')
  })

  it('Should trade 1 MKR -> ETH correctly', async function() {
    const intAmount = utils.parseEther('1')
    let outAmount: BigNumber = await this.route.getDestinationReturnAmount(this.mkrAddress, this.ethAddress, intAmount)
    console.log('1 MKR -> ? ETH', utils.formatUnits(outAmount, 18))

    const trader = await ethers.provider.getSigner(a16zAddress)

    await this.mkr.connect(trader).approve(this.route.address, ethers.constants.MaxUint256)
    await expect(() =>  this.route.connect(trader).trade(
      this.mkrAddress,
      this.ethAddress,
      intAmount
    ))
    .to.changeEtherBalance(trader, outAmount)

    await expect(() =>  this.route.connect(trader).trade(
      this.mkrAddress,
      this.ethAddress,
      intAmount
    ))
    .to.changeTokenBalance(this.mkr, trader, '-1000000000000000000')
  })
})
