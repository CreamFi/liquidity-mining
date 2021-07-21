const { ethers, run } = require("hardhat");

admin = "0x197939c1ca20C2b506d6811d8B6CDB3394471074";
comptroller = "0x589DE0F0Ccf905477646599bb3E5C622C84cC0BA";

async function main() {

  const lensFactory = await ethers.getContractFactory("LiquidityMiningLens");
  const liquidityMiningFactory = await ethers.getContractFactory("LiquidityMining");
  const proxyFactory = await ethers.getContractFactory("LiquidityMiningProxy");

  const liquidityMining = await liquidityMiningFactory.deploy();
  console.log("Implementation deployed to:", liquidityMining.address);
  await liquidityMining.deployed();

  const fragment = liquidityMiningFactory.interface.getFunction('initialize');
  const initData = liquidityMiningFactory.interface.encodeFunctionData(fragment, [admin, comptroller]);
  const proxy = await proxyFactory.deploy(liquidityMining.address, initData);

  console.log("Proxy deployed to:", proxy.address);
  console.log("constructor agrs:", liquidityMining.address, initData);

  await proxy.deployed();

  const lens = await lensFactory.deploy(proxy.address);
  console.log("Lens deployed to:", lens.address);
}

async function verify() {
  const implAddress = "0xd45498dBb6906b77f64D527B18862C938CBa5a9D";
  const proxy = "0x004D2829E5C21377DBE561E15c8a830389D524Fa";
  const constructAgrs = ["0xd45498dBb6906b77f64D527B18862C938CBa5a9D", "0x485cc955000000000000000000000000197939c1ca20c2b506d6811d8b6cdb3394471074000000000000000000000000589de0f0ccf905477646599bb3e5c622c84cc0ba"];
  const lens = "0x723C4acecA62a3759c1c6d9ABe1e3C8F581f9092";
  await run("verify:verify", {
    address: implAddress,
    contract: "contracts/LiquidityMining.sol:LiquidityMining"
  });
  await run("verify:verify", {
    address: proxy,
    constructorArguments: constructAgrs,
    contract: "contracts/LiquidityMiningProxy.sol:LiquidityMiningProxy"
  });
  await run("verify:verify", {
    address: lens,
    constructorArguments: [proxy],
    contract: "contracts/LiquidityMiningLens.sol:LiquidityMiningLens"
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
