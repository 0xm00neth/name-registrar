# NameRegistrar Smart Contract

-------------------

## Description

NameRegistrar is a name registration system that is resistant against front-running.
Users can commit their name in the hash format using `commit()` function and then reveal the name using `reveal()` function.
Fee for name registration can be calculated as below.
```
Registration Fee = Name Length * 0.01 ETH
```

When registering name, users should lock `0.5 ETH` into the contract and can be unlock it after the name expires.

-------------------

## Deployment

Run below script to deploy `NameRegistrar` contract to Ethereum Mainnet.

```shell
npm run deploy-mainnet
```

Run below script to deploy `NameRegistrar` contract to Rinkeby Testnet.

```shell
npm run deploy-testnet
```

-------------------

## Unit Tests

Run unit tests by running below script.

```shell
npm run test
```

Unit tests include these test cases.

- Commit Tests
    -  should commit hash
- Reveal tests
    - should reveal the name
    - should not register same name for 2 users
    - should be able to register same name after LOCK_PERIOD
    - should not register 2 names for one user at the same time
    - should expire after LOCK_PERIOD
- Renew tests
    - should renew name
    - should not renew after name expires
    - should not renew unregistered name
- Unlock Balance tests
    - should not unlock when no name registered
    - should not unlock before name expires
    - should not unlock twice
