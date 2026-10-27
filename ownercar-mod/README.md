# Owner Car 🚗 — Mod de Minecraft (NeoForge 1.21.1)

Um mod que adiciona um **carro dirigível** com **chave de dono** e **sistema de gasolina**.

- Cada carro tem um **dono** (registrado pelo UUID do jogador).
- **Só o dono** pode entrar, **trancar/destrancar** (abrir/fechar) e **ligar/desligar** o carro.
- O carro **anda com gasolina** — a gasolina acaba conforme você dirige.
- Textura de **hatch branco compacto** (inspirada numa Renault Kwid, feita no estilo caixinha do Minecraft — você pode trocar por uma textura própria).

> **Minecraft 1.21.1 · NeoForge · Java 21**

---

## 📦 Conteúdo (3 itens)

| Item | Para que serve |
|------|----------------|
| **Carro** | Use no chão para "estacionar" o carro no mundo. Quem coloca vira o **dono**. |
| **Chave do Carro** | Liga/desliga e tranca/destranca. Fica marcada com o nome do dono. |
| **Lata de Gasolina** | Clique no carro para **abastecer** (+50 de gasolina por lata, tanque = 100). |

Os três aparecem na aba criativa **"Owner Car"** e também têm **receita de craft**.

---

## 🎮 Controles

Segurando a **Chave** (como dono):
- **Clique direito no carro** → liga / desliga o motor
- **Shift + clique direito** → tranca / destranca (abre/fecha)

Mão vazia:
- **Clique direito no carro** → entra (se estiver destrancado)

Dirigindo:
- **W / S** → acelera / ré
- **A / D** → esterça (vira)
- A velocidade e a gasolina aparecem na **barra de ação** enquanto você dirige.

Outros:
- **Lata de Gasolina + clique direito** → abastece
- **Bater no carro** (sendo o dono, ou no criativo) → recolhe o carro de volta como item

Quem **não é o dono** não consegue entrar, ligar, trancar nem recolher — recebe a mensagem "Este carro é de Fulano. Você não tem a chave!".

---

## 🔨 Como compilar e testar

Você precisa de **JDK 21** instalado e **internet** (para o Gradle baixar o NeoForge).

```bash
cd ownercar-mod

# Abrir o Minecraft com o mod já carregado (cliente de teste):
./gradlew runClient        # Windows: gradlew.bat runClient

# Só gerar o .jar do mod:
./gradlew build
```

O `.jar` final fica em `build/libs/ownercar-1.0.0.jar`.
Para usar num jogo normal: instale o **NeoForge 1.21.1** e jogue o `.jar` na pasta `mods/`.

### ⚠️ Versão do NeoForge
Em `gradle.properties`, a linha `neo_version=21.1.95` define a build do NeoForge.
Se o Gradle reclamar que a versão não existe, pegue a mais recente de **1.21.1** em
<https://projects.neoforged.net/neoforged/neoforge> (as que começam com `21.1.`) e troque o número.

---

## 🛠️ Ajustes rápidos

Quase tudo que dá pra "sentir" está em constantes no topo de
`src/main/java/com/breno/ownercar/entity/CarEntity.java`:

| Constante | O que muda |
|-----------|-----------|
| `MAX_SPEED` | velocidade máxima |
| `ACCEL` | quão rápido acelera |
| `TURN_RATE` | quão rápido vira |
| `MAX_FUEL` / `GAS_PER_CAN` | tamanho do tanque / abastecimento por lata |
| `FUEL_PER_BLOCK` / `IDLE_FUEL` | consumo de gasolina |

Se, ao testar, o carro **virar para o lado errado**, inverta o sinal na linha marcada
dentro de `updatePhysics()`. Se ele aparecer **de ré visualmente**, troque `-entityYaw`
por `180 - entityYaw` em `client/CarRenderer.java`. (Esses dois sinais dependem do
jogo rodando e são os únicos pontos que podem precisar de 1 ajuste.)

A textura do carro é `src/main/resources/assets/ownercar/textures/entity/car.png`
(128×128). O modelo 3D está em `client/CarModel.java` — dá pra editar no
[Blockbench](https://www.blockbench.net/) (formato "Modded Entity") para um carro
mais detalhado.

---

## 📁 Estrutura

```
ownercar-mod/
├─ build.gradle / settings.gradle / gradle.properties
├─ src/main/java/com/breno/ownercar/
│  ├─ OwnerCarMod.java            (entrada do mod)
│  ├─ entity/CarEntity.java       (dono, trava, motor, gasolina, física)
│  ├─ item/CarItem.java           (coloca o carro)
│  ├─ item/CarKeyItem.java        (a chave)
│  ├─ item/GasCanItem.java        (a lata de gasolina)
│  ├─ client/CarModel.java        (modelo 3D)
│  ├─ client/CarRenderer.java     (desenho no mundo)
│  ├─ client/OwnerCarClient.java  (registro de render no cliente)
│  └─ registry/                   (itens, entidade, data components)
└─ src/main/resources/
   ├─ assets/ownercar/            (texturas, modelos, idiomas pt_br/en_us)
   └─ data/ownercar/recipe/       (receitas de craft)
```

Licença: MIT.
