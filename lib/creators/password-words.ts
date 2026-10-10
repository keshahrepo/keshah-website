/**
 * Short, common, friendly English words (3 to 5 letters, lowercase a-z) for
 * generated social account passwords (lib/creators/account-passwords.ts).
 * Curated by hand: no offensive, violent, body-shaming or loaded words.
 * Five letters max keeps "Word-word-word-42" within TikTok's 20 character limit.
 */
const RAW = `
able acorn acre actor add adore after again age agree aid aim air album alert alike alive alley allow alpha
alto amaze amber amigo ample angel angle ankle apex apple april apron arch area arena arm aroma arrow art ash
ask aspen atlas atom attic audio aunt avid awake award aware axe axis baby back bacon badge bagel bake baker
balm band bank barn basic basil basin batch bath bay beach beam bean bear beard beat bee beef begin bell belt
bench berry best bike bingo birch bird birth bison blade blank blaze blend bless blimp blink block bloom blue
bluff blush board boat bolt bone bongo bonus book boost boot booth boss bowl box brain brake brass brave
bread break brew brick brief bring brisk broad brook broom brush bud buddy build bulb bump bun bunch bunk
bunny bus bush busy buyer cabin cable cache cake calm camel camp canal candy cane canoe cape card cargo carol
carry cart case cash cast cat catch cause cave cedar cell chain chair chalk champ charm chart chase cheek
cheer chef chess chest chick chief child chili chill chin chip choir chord chunk cider city civic clam clap
class clay clean clear clerk click cliff climb clock close cloth cloud clove clown club clue coach coast coat
cocoa code coin cola cold color comb comet comic cook cool coral cord core cork corn couch count court cover
cozy crab craft crane crate crawl cream creek crew crisp crop cross crowd crown crumb crust cub cube cup curl
curry curve cute cycle daily dairy daisy dance dart dash data date dawn day deal dear deck decor deep deer
deli delta denim depth desk dew dial diary dice dime diner dingo disco dish dive dock dog doll donut door dot
dough dove down dozen draft drama draw dream dress drift drive drum duck duet dune dusk dust dusty eager
eagle ear early earth easel east easy echo edge eel egg eight elbow elder elf elk elm ember empty emu end
enjoy enter entry epic equal essay even event exact exam extra eye fable face fact fair fairy faith fame
fancy farm fast fawn feast fern ferry feta fiber field fifth fifty fig film final finch find fine fire firm
first fish five fix fizz fjord flag flair flame flash flat fleck flint flock flood floor flora flour flow
fluff flute fly foam focus fog folio folk food foot fork form fort forty fox frame free fresh fried fries
frisk frog front frost froth fruit fudge full fun fur gala gale game gate gauge gear gecko gem genie giant
gift give glad glass glen glide globe glove glow glue gnome goal goat gold golf gong good goose gourd grab
grace grade grain grand grape graph grass gravy great green greet grid grill grin grip group grove grow guard
guess guest guide gulf gull gum guppy guru gust habit haiku hair half hall halo ham hand happy hare harp hat
hawk hazel hazy head heap heart heat hedge hello helm help hen herb hero heron hike hill hint hive hobby hold
home honey hood hook hoop hope horn horse host hotel hour house hug hula humor hunch husky hut ice icing icon
idea igloo image inch index ink inky inlet input iris iron item ivory ivy jade jam jar jazz jeans jelly jet
jewel job jog join joke jolly joy judge juice jumbo jump jury kale kayak kazoo kebab keen kelp kept key kid
kiln kin kind king kiosk kite kiwi knee knit knob knot koala kudos label lace lake lamb lamp land lane lark
laser latch latte laugh lava lawn layer leaf leafy learn ledge lemon lens level lever light lilac lily limbo
lime line linen lion list live llama load loaf lobby local lock lodge loft lofty logic long loop lotus loud
love lucky lumen lunar lunch lyric magic mail main major make mango map maple march mark mask match math maze
meal medal melon menu merit merry mesh metal meter mild milk mill mind mint minus mist mix mocha model mold
money month moody moon moose more moss mossy motel motor mouse mouth move movie mud mug mule mural music
nacho nail name nap navy near neat neck nest net new news next nice night nine ninja noble noise north nose
note novel nurse oak oasis oat oboe ocean offer often oil olive omega one onion onyx opal open opera orbit
order otter ounce outer oval oven owl owner pace pack page paint pair palm panda panel paper park party pasta
paste patch path patio pause peace peach peak pear pearl pecan pedal pen penny peony perch pesto petal piano
pick pie piece pier pilot pine pink pinto pipe pitch pixel pizza place plaid plain plan plane plant plate
play plaza plot plum plume plus pod poem point polar polka polo pond pony pool pop poppy porch port pose post
pouch power press price pride prime print prism prize proof proud pulse pump pupil puppy purse quack quail
quart queen quest quick quiet quill quilt quiz quote radar radio raft rail rain rally ramen ranch range rapid
raven ray reach read ready real red reef relax relay relic remix rent reply rest rhyme rice ride ridge right
ring rinse ripe rise river road roast robe robin robot rock rodeo roof room root rope rose rosy round route
royal ruby rug ruler rumba run rural rush saga sage sail salad salon salsa salt samba same sand satin sauce
save scale scarf scene scent scone scoop scout sea seal seat seed seven shade shape share shark sharp sheep
shelf shell shift shine shiny ship shirt shoe shop shore short shout show shrub side sign silk silky sing
sink six size skate ski skiff skill skirt sky slate sled sleek sleep slice slide slope sloth slow small smart
smile smoky snack snail snow snug soap sock sofa soft soil solar solid song sonic sound soup south space
spark speak spice spin spoon sport spot spray squid stack staff stage stair stamp stand star start state
steam steel stem step stew stick still stone stool store stork storm story stove straw study style sugar suit
sun sunny super sure surf sushi swan sweet swift swim swing syrup table taco taffy tail talk tall tame tango
tank tape tapir taste tea teach teal team teeth tempo ten tent test thank theme thick thing third thumb thyme
tiara tide tidy tiger tile time tiny tip title toast today toe token tone tool tooth top topaz topic torch
total totem touch tour towel tower town toy track trade trail train tray treat tree trend trial trick trip
trout truck true trunk trust truth try tuba tulip tuna tune tutor twig twin type ultra uncle under union unit
unity upper urban use usual value van vapor vase vault vegan venue verb verse very vest video view villa vine
vinyl visit vista vital vivid vocal voice vote wafer wagon walk wall wand warm wash watch water wave wax way
weave web wedge week well west whale wheat wheel whim whisk whole wide wild win wind wing wink wire wise wish
witty wolf wood wool word work world worth wrap wren wrist write yacht yard yarn year yes yeti yodel yoga
young youth yummy zany zebra zero zest zesty zinc zip zippy zone zoo
`;

export const PASSWORD_WORDS: readonly string[] = Object.freeze(RAW.split(/\s+/).filter(Boolean));
