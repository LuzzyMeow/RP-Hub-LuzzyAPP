/**
 * LUZZY 图标组件库
 *
 * 基于 game-icon-pack (CC0 1.0 Universal) 封装的统一图标组件。
 * 使用 vite-plugin-svgr 将 SVG 转为 React 组件。
 *
 * 用法: import { IconMenu, IconSearch } from '~/components/luzzy/luzzy-icons';
 *
 * 所有图标接受 className 和 size props (默认 16)。
 */

import * as React from 'react';

import IconAnchorSrc from '~/assets/icons/IconAnchor.svg?react';
import IconAnimalSrc from '~/assets/icons/IconAnimal.svg?react';
import IconAnvilSrc from '~/assets/icons/IconAnvil.svg?react';
import IconAppleSrc from '~/assets/icons/IconApple.svg?react';
import IconArrowSrc from '~/assets/icons/IconArrow.svg?react';
import IconArrowDownSrc from '~/assets/icons/IconArrowDown.svg?react';
import IconArrowUpSrc from '~/assets/icons/IconArrowUp.svg?react';
import IconAToZSrc from '~/assets/icons/IconAToZ.svg?react';
import IconAttachSrc from '~/assets/icons/IconAttach.svg?react';
import IconAxeSrc from '~/assets/icons/IconAxe.svg?react';
import IconBackpackSrc from '~/assets/icons/IconBackpack.svg?react';
import IconBambooSrc from '~/assets/icons/IconBamboo.svg?react';
import IconBankSrc from '~/assets/icons/IconBank.svg?react';
import IconBearSrc from '~/assets/icons/IconBear.svg?react';
import IconBedSrc from '~/assets/icons/IconBed.svg?react';
import IconBikeSrc from '~/assets/icons/IconBike.svg?react';
import IconBoatSrc from '~/assets/icons/IconBoat.svg?react';
import IconBoldSrc from '~/assets/icons/IconBold.svg?react';
import IconBombSrc from '~/assets/icons/IconBomb.svg?react';
import IconBoneSrc from '~/assets/icons/IconBone.svg?react';
import IconBookSrc from '~/assets/icons/IconBook.svg?react';
import IconBookmarkSrc from '~/assets/icons/IconBookmark.svg?react';
import IconBossSrc from '~/assets/icons/IconBoss.svg?react';
import IconBowSrc from '~/assets/icons/IconBow.svg?react';
import IconBranchSrc from '~/assets/icons/IconBranch.svg?react';
import IconBreadSrc from '~/assets/icons/IconBread.svg?react';
import IconBrushSrc from '~/assets/icons/IconBrush.svg?react';
import IconBugSrc from '~/assets/icons/IconBug.svg?react';
import IconBulletSrc from '~/assets/icons/IconBullet.svg?react';
import IconBullhornSrc from '~/assets/icons/IconBullhorn.svg?react';
import IconBusSrc from '~/assets/icons/IconBus.svg?react';
import IconCactusSrc from '~/assets/icons/IconCactus.svg?react';
import IconCalendarSrc from '~/assets/icons/IconCalendar.svg?react';
import IconCameraSrc from '~/assets/icons/IconCamera.svg?react';
import IconCapsuleSrc from '~/assets/icons/IconCapsule.svg?react';
import IconCardSrc from '~/assets/icons/IconCard.svg?react';
import IconCardsSrc from '~/assets/icons/IconCards.svg?react';
import IconCatSrc from '~/assets/icons/IconCat.svg?react';
import IconChairSrc from '~/assets/icons/IconChair.svg?react';
import IconChangeSrc from '~/assets/icons/IconChange.svg?react';
import IconCharacterSrc from '~/assets/icons/IconCharacter.svg?react';
import IconCheckSrc from '~/assets/icons/IconCheck.svg?react';
import IconChestSrc from '~/assets/icons/IconChest.svg?react';
import IconChevronLeftSrc from '~/assets/icons/IconChevronLeft.svg?react';
import IconChevronRightSrc from '~/assets/icons/IconChevronRight.svg?react';
import IconCircleSrc from '~/assets/icons/IconCircle.svg?react';
import IconCircleRingSrc from '~/assets/icons/IconCircleRing.svg?react';
import IconClapperSrc from '~/assets/icons/IconClapper.svg?react';
import IconClockSrc from '~/assets/icons/IconClock.svg?react';
import IconCloseSrc from '~/assets/icons/IconClose.svg?react';
import IconCloudSrc from '~/assets/icons/IconCloud.svg?react';
import IconCloudySrc from '~/assets/icons/IconCloudy.svg?react';
import IconCloverSrc from '~/assets/icons/IconClover.svg?react';
import IconClubCardSrc from '~/assets/icons/IconClubCard.svg?react';
import IconClubsSrc from '~/assets/icons/IconClubs.svg?react';
import IconCoatSrc from '~/assets/icons/IconCoat.svg?react';
import IconCodeSrc from '~/assets/icons/IconCode.svg?react';
import IconCoinSrc from '~/assets/icons/IconCoin.svg?react';
import IconCompassSrc from '~/assets/icons/IconCompass.svg?react';
import IconCopyEditSrc from '~/assets/icons/IconCopyEdit.svg?react';
import IconCornerSrc from '~/assets/icons/IconCorner.svg?react';
import IconCowSrc from '~/assets/icons/IconCow.svg?react';
import IconCrownSrc from '~/assets/icons/IconCrown.svg?react';
import IconDaggerSrc from '~/assets/icons/IconDagger.svg?react';
import IconDarkModeSrc from '~/assets/icons/IconDarkMode.svg?react';
import IconDeathSrc from '~/assets/icons/IconDeath.svg?react';
import IconDemonSrc from '~/assets/icons/IconDemon.svg?react';
import IconDemon2Src from '~/assets/icons/IconDemon2.svg?react';
import IconDiamondSrc from '~/assets/icons/IconDiamond.svg?react';
import IconDiamondsSrc from '~/assets/icons/IconDiamonds.svg?react';
import IconDiceSrc from '~/assets/icons/IconDice.svg?react';
import IconDicePairSrc from '~/assets/icons/IconDicePair.svg?react';
import IconDislikeSrc from '~/assets/icons/IconDislike.svg?react';
import IconDisplaySrc from '~/assets/icons/IconDisplay.svg?react';
import IconDocumentSrc from '~/assets/icons/IconDocument.svg?react';
import IconDogSrc from '~/assets/icons/IconDog.svg?react';
import IconDoorSrc from '~/assets/icons/IconDoor.svg?react';
import IconDownloadSrc from '~/assets/icons/IconDownload.svg?react';
import IconDressSrc from '~/assets/icons/IconDress.svg?react';
import IconDrinkSrc from '~/assets/icons/IconDrink.svg?react';
import IconDumbbellSrc from '~/assets/icons/IconDumbbell.svg?react';
import IconEarringSrc from '~/assets/icons/IconEarring.svg?react';
import IconEditSrc from '~/assets/icons/IconEdit.svg?react';
import IconEmojiSrc from '~/assets/icons/IconEmoji.svg?react';
import IconEqualsSrc from '~/assets/icons/IconEquals.svg?react';
import IconEraserSrc from '~/assets/icons/IconEraser.svg?react';
import IconEurSrc from '~/assets/icons/IconEur.svg?react';
import IconExclamationSrc from '~/assets/icons/IconExclamation.svg?react';
import IconExpandSrc from '~/assets/icons/IconExpand.svg?react';
import IconExternalLinkSrc from '~/assets/icons/IconExternalLink.svg?react';
import IconExportSrc from '~/assets/icons/IconExport.svg?react';
import IconFemaleSrc from '~/assets/icons/IconFemale.svg?react';
import IconFileSrc from '~/assets/icons/IconFile.svg?react';
import IconFillSrc from '~/assets/icons/IconFill.svg?react';
import IconFilmSrc from '~/assets/icons/IconFilm.svg?react';
import IconFireSrc from '~/assets/icons/IconFire.svg?react';
import IconFishSrc from '~/assets/icons/IconFish.svg?react';
import IconFish2Src from '~/assets/icons/IconFish2.svg?react';
import IconFishhookSrc from '~/assets/icons/IconFishhook.svg?react';
import IconFlagSrc from '~/assets/icons/IconFlag.svg?react';
import IconFlowerSrc from '~/assets/icons/IconFlower.svg?react';
import IconFolderSrc from '~/assets/icons/IconFolder.svg?react';
import IconFontSrc from '~/assets/icons/IconFont.svg?react';
import IconForestSrc from '~/assets/icons/IconForest.svg?react';
import IconFoxSrc from '~/assets/icons/IconFox.svg?react';
import IconFrameSrc from '~/assets/icons/IconFrame.svg?react';
import IconFunnelSrc from '~/assets/icons/IconFunnel.svg?react';
import IconGbpSrc from '~/assets/icons/IconGbp.svg?react';
import IconGhostSrc from '~/assets/icons/IconGhost.svg?react';
import IconGlobeSrc from '~/assets/icons/IconGlobe.svg?react';
import IconGrassSrc from '~/assets/icons/IconGrass.svg?react';
import IconGridSrc from '~/assets/icons/IconGrid.svg?react';
import IconHalloweenSrc from '~/assets/icons/IconHalloween.svg?react';
import IconHammerSrc from '~/assets/icons/IconHammer.svg?react';
import IconHayforkSrc from '~/assets/icons/IconHayfork.svg?react';
import IconHeadsetSrc from '~/assets/icons/IconHeadset.svg?react';
import IconHealthSrc from '~/assets/icons/IconHealth.svg?react';
import IconHeartSrc from '~/assets/icons/IconHeart.svg?react';
import IconHeartBreakSrc from '~/assets/icons/IconHeartBreak.svg?react';
import IconHeartCardSrc from '~/assets/icons/IconHeartCard.svg?react';
import IconHeartsSrc from '~/assets/icons/IconHearts.svg?react';
import IconHelmSrc from '~/assets/icons/IconHelm.svg?react';
import IconHistorySrc from '~/assets/icons/IconHistory.svg?react';
import IconHornSrc from '~/assets/icons/IconHorn.svg?react';
import IconHorseSrc from '~/assets/icons/IconHorse.svg?react';
import IconHouseSrc from '~/assets/icons/IconHouse.svg?react';
import IconImageSrc from '~/assets/icons/IconImage.svg?react';
import IconImportSrc from '~/assets/icons/IconImport.svg?react';
import IconInfoSrc from '~/assets/icons/IconInfo.svg?react';
import IconIngotSrc from '~/assets/icons/IconIngot.svg?react';
import IconInrSrc from '~/assets/icons/IconInr.svg?react';
import IconInternetSrc from '~/assets/icons/IconInternet.svg?react';
import IconInvisibleSrc from '~/assets/icons/IconInvisible.svg?react';
import IconItalicSrc from '~/assets/icons/IconItalic.svg?react';
import IconKeySrc from '~/assets/icons/IconKey.svg?react';
import IconKeyboardSrc from '~/assets/icons/IconKeyboard.svg?react';
import IconKrwSrc from '~/assets/icons/IconKrw.svg?react';
import IconLaptopSrc from '~/assets/icons/IconLaptop.svg?react';
import IconLeavesSrc from '~/assets/icons/IconLeaves.svg?react';
import IconLevelSrc from '~/assets/icons/IconLevel.svg?react';
import IconLightSrc from '~/assets/icons/IconLight.svg?react';
import IconLightModeSrc from '~/assets/icons/IconLightMode.svg?react';
import IconLikeSrc from '~/assets/icons/IconLike.svg?react';
import IconLinkSrc from '~/assets/icons/IconLink.svg?react';
import IconLiveSrc from '~/assets/icons/IconLive.svg?react';
import IconLocationSrc from '~/assets/icons/IconLocation.svg?react';
import IconLogSrc from '~/assets/icons/IconLog.svg?react';
import IconLockSrc from '~/assets/icons/IconLock.svg?react';
import IconMaceSrc from '~/assets/icons/IconMace.svg?react';
import IconMagazineSrc from '~/assets/icons/IconMagazine.svg?react';
import IconMagnetSrc from '~/assets/icons/IconMagnet.svg?react';
import IconMahjongSrc from '~/assets/icons/IconMahjong.svg?react';
import IconMailSrc from '~/assets/icons/IconMail.svg?react';
import IconMaleSrc from '~/assets/icons/IconMale.svg?react';
import IconManaSrc from '~/assets/icons/IconMana.svg?react';
import IconMapSrc from '~/assets/icons/IconMap.svg?react';
import IconMentionSrc from '~/assets/icons/IconMention.svg?react';
import IconMenuSrc from '~/assets/icons/IconMenu.svg?react';
import IconMessageSrc from '~/assets/icons/IconMessage.svg?react';
import IconMeteorSrc from '~/assets/icons/IconMeteor.svg?react';
import IconMicSrc from '~/assets/icons/IconMic.svg?react';
import IconMinusSrc from '~/assets/icons/IconMinus.svg?react';
import IconMissileSrc from '~/assets/icons/IconMissile.svg?react';
import IconMouseSrc from '~/assets/icons/IconMouse.svg?react';
import IconMusicSrc from '~/assets/icons/IconMusic.svg?react';
import IconMuteSrc from '~/assets/icons/IconMute.svg?react';
import IconNailSrc from '~/assets/icons/IconNail.svg?react';
import IconNecklaceSrc from '~/assets/icons/IconNecklace.svg?react';
import IconNecktieSrc from '~/assets/icons/IconNecktie.svg?react';
import IconNextSrc from '~/assets/icons/IconNext.svg?react';
import IconNgnSrc from '~/assets/icons/IconNgn.svg?react';
import IconNightSrc from '~/assets/icons/IconNight.svg?react';
import IconPandaSrc from '~/assets/icons/IconPanda.svg?react';
import IconPantsSrc from '~/assets/icons/IconPants.svg?react';
import IconPasteSrc from '~/assets/icons/IconPaste.svg?react';
import IconPauseSrc from '~/assets/icons/IconPause.svg?react';
import IconPcHostSrc from '~/assets/icons/IconPcHost.svg?react';
import IconPhoneSrc from '~/assets/icons/IconPhone.svg?react';
import IconPiSrc from '~/assets/icons/IconPi.svg?react';
import IconPickaxeSrc from '~/assets/icons/IconPickaxe.svg?react';
import IconPigSrc from '~/assets/icons/IconPig.svg?react';
import IconPillSrc from '~/assets/icons/IconPill.svg?react';
import IconPistolSrc from '~/assets/icons/IconPistol.svg?react';
import IconPlaneSrc from '~/assets/icons/IconPlane.svg?react';
import IconPlaySrc from '~/assets/icons/IconPlay.svg?react';
import IconPlusSrc from '~/assets/icons/IconPlus.svg?react';
import IconPotionSrc from '~/assets/icons/IconPotion.svg?react';
import IconPreviousSrc from '~/assets/icons/IconPrevious.svg?react';
import IconProgressSrc from '~/assets/icons/IconProgress.svg?react';
import IconProhibitedSrc from '~/assets/icons/IconProhibited.svg?react';
import IconProtectSrc from '~/assets/icons/IconProtect.svg?react';
import IconPushpinSrc from '~/assets/icons/IconPushpin.svg?react';
import IconPuzzleSrc from '~/assets/icons/IconPuzzle.svg?react';
import IconPuzzle2Src from '~/assets/icons/IconPuzzle2.svg?react';
import IconQrCodeSrc from '~/assets/icons/IconQrCode.svg?react';
import IconRabbitSrc from '~/assets/icons/IconRabbit.svg?react';
import IconRainSrc from '~/assets/icons/IconRain.svg?react';
import IconRainbowSrc from '~/assets/icons/IconRainbow.svg?react';
import IconRankingSrc from '~/assets/icons/IconRanking.svg?react';
import IconRecordSrc from '~/assets/icons/IconRecord.svg?react';
import IconRedoSrc from '~/assets/icons/IconRedo.svg?react';
import IconRefreshSrc from '~/assets/icons/IconRefresh.svg?react';
import IconRestoreSrc from '~/assets/icons/IconRestore.svg?react';
import IconRingSrc from '~/assets/icons/IconRing.svg?react';
import IconRiverSrc from '~/assets/icons/IconRiver.svg?react';
import IconRotateLeftSrc from '~/assets/icons/IconRotateLeft.svg?react';
import IconRubSrc from '~/assets/icons/IconRub.svg?react';
import IconRulerSrc from '~/assets/icons/IconRuler.svg?react';
import IconSaveSrc from '~/assets/icons/IconSave.svg?react';
import IconSawSrc from '~/assets/icons/IconSaw.svg?react';
import IconScanSrc from '~/assets/icons/IconScan.svg?react';
import IconScissorsSrc from '~/assets/icons/IconScissors.svg?react';
import IconSeaSrc from '~/assets/icons/IconSea.svg?react';
import IconSearchSrc from '~/assets/icons/IconSearch.svg?react';
import IconSendSrc from '~/assets/icons/IconSend.svg?react';
import IconSettingsSrc from '~/assets/icons/IconSettings.svg?react';
import IconShareSrc from '~/assets/icons/IconShare.svg?react';
import IconSheepSrc from '~/assets/icons/IconSheep.svg?react';
import IconShieldSrc from '~/assets/icons/IconShield.svg?react';
import IconShield2Src from '~/assets/icons/IconShield2.svg?react';
import IconShirtSrc from '~/assets/icons/IconShirt.svg?react';
import IconShoeSrc from '~/assets/icons/IconShoe.svg?react';
import IconShopSrc from '~/assets/icons/IconShop.svg?react';
import IconShortsSrc from '~/assets/icons/IconShorts.svg?react';
import IconShovelSrc from '~/assets/icons/IconShovel.svg?react';
import IconShrimpSrc from '~/assets/icons/IconShrimp.svg?react';
import IconSickleSrc from '~/assets/icons/IconSickle.svg?react';
import IconSignSrc from '~/assets/icons/IconSign.svg?react';
import IconSilentSrc from '~/assets/icons/IconSilent.svg?react';
import IconSkirtSrc from '~/assets/icons/IconSkirt.svg?react';
import IconSkullSrc from '~/assets/icons/IconSkull.svg?react';
import IconSliderSrc from '~/assets/icons/IconSlider.svg?react';
import IconSnowySrc from '~/assets/icons/IconSnowy.svg?react';
import IconSoccerSrc from '~/assets/icons/IconSoccer.svg?react';
import IconSortSrc from '~/assets/icons/IconSort.svg?react';
import IconSpadesSrc from '~/assets/icons/IconSpades.svg?react';
import IconSpearSrc from '~/assets/icons/IconSpear.svg?react';
import IconSplitSrc from '~/assets/icons/IconSplit.svg?react';
import IconSquareSrc from '~/assets/icons/IconSquare.svg?react';
import IconStaminaSrc from '~/assets/icons/IconStamina.svg?react';
import IconStarSrc from '~/assets/icons/IconStar.svg?react';
import IconStickSrc from '~/assets/icons/IconStick.svg?react';
import IconStoneSrc from '~/assets/icons/IconStone.svg?react';
import IconStopSrc from '~/assets/icons/IconStop.svg?react';
import IconSunSrc from '~/assets/icons/IconSun.svg?react';
import IconSun2Src from '~/assets/icons/IconSun2.svg?react';
import IconSwordSrc from '~/assets/icons/IconSword.svg?react';
import IconSyceeSrc from '~/assets/icons/IconSycee.svg?react';
import IconTableSrc from '~/assets/icons/IconTable.svg?react';
import IconTabletSrc from '~/assets/icons/IconTablet.svg?react';
import IconTagSrc from '~/assets/icons/IconTag.svg?react';
import IconTentSrc from '~/assets/icons/IconTent.svg?react';
import IconTerminalSrc from '~/assets/icons/IconTerminal.svg?react';
import IconTextSrc from '~/assets/icons/IconText.svg?react';
import IconThbSrc from '~/assets/icons/IconThb.svg?react';
import IconTimeSrc from '~/assets/icons/IconTime.svg?react';
import IconToggleOffSrc from '~/assets/icons/IconToggleOff.svg?react';
import IconToggleOnSrc from '~/assets/icons/IconToggleOn.svg?react';
import IconToolKitSrc from '~/assets/icons/IconToolKit.svg?react';
import IconTorchSrc from '~/assets/icons/IconTorch.svg?react';
import IconTowerSrc from '~/assets/icons/IconTower.svg?react';
import IconTownSrc from '~/assets/icons/IconTown.svg?react';
import IconTrashSrc from '~/assets/icons/IconTrash.svg?react';
import IconTreeSrc from '~/assets/icons/IconTree.svg?react';
import IconTree2Src from '~/assets/icons/IconTree2.svg?react';
import IconTriangleSrc from '~/assets/icons/IconTriangle.svg?react';
import IconTridentSrc from '~/assets/icons/IconTrident.svg?react';
import IconTrophySrc from '~/assets/icons/IconTrophy.svg?react';
import IconTruckSrc from '~/assets/icons/IconTruck.svg?react';
import IconTrySrc from '~/assets/icons/IconTry.svg?react';
import IconUmbrellaSrc from '~/assets/icons/IconUmbrella.svg?react';
import IconUndoSrc from '~/assets/icons/IconUndo.svg?react';
import IconUnlockSrc from '~/assets/icons/IconUnlock.svg?react';
import IconUploadSrc from '~/assets/icons/IconUpload.svg?react';
import IconUsdSrc from '~/assets/icons/IconUsd.svg?react';
import IconUserSrc from '~/assets/icons/IconUser.svg?react';
import IconUserAddSrc from '~/assets/icons/IconUserAdd.svg?react';
import IconUserAvatarSrc from '~/assets/icons/IconUserAvatar.svg?react';
import IconUserGroupSrc from '~/assets/icons/IconUserGroup.svg?react';
import IconVideoSrc from '~/assets/icons/IconVideo.svg?react';
import IconVisibleSrc from '~/assets/icons/IconVisible.svg?react';
import IconVolcanoSrc from '~/assets/icons/IconVolcano.svg?react';
import IconVolumeSrc from '~/assets/icons/IconVolume.svg?react';
import IconWandSrc from '~/assets/icons/IconWand.svg?react';
import IconWand2Src from '~/assets/icons/IconWand2.svg?react';
import IconWatchSrc from '~/assets/icons/IconWatch.svg?react';
import IconWaterSrc from '~/assets/icons/IconWater.svg?react';
import IconWebcamSrc from '~/assets/icons/IconWebcam.svg?react';
import IconWheelSrc from '~/assets/icons/IconWheel.svg?react';
import IconWifiSrc from '~/assets/icons/IconWifi.svg?react';
import IconWindSrc from '~/assets/icons/IconWind.svg?react';
import IconWineglassSrc from '~/assets/icons/IconWineglass.svg?react';
import IconWolfSrc from '~/assets/icons/IconWolf.svg?react';
import IconWoodSrc from '~/assets/icons/IconWood.svg?react';
import IconWrenchSrc from '~/assets/icons/IconWrench.svg?react';
import IconYenSrc from '~/assets/icons/IconYen.svg?react';
import IconYuanSrc from '~/assets/icons/IconYuan.svg?react';
import IconZoomInSrc from '~/assets/icons/IconZoomIn.svg?react';
import IconZoomOutSrc from '~/assets/icons/IconZoomOut.svg?react';

export interface LuzzyIconProps extends React.SVGProps<SVGSVGElement> {
  /** 图标尺寸（px），默认 16 */
  size?: number;
}

/** IconAnchor 图标 */
export const IconAnchor = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconAnchorSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconAnchor.displayName = 'IconAnchor';

/** IconAnimal 图标 */
export const IconAnimal = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconAnimalSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconAnimal.displayName = 'IconAnimal';

/** IconAnvil 图标 */
export const IconAnvil = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconAnvilSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconAnvil.displayName = 'IconAnvil';

/** IconApple 图标 */
export const IconApple = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconAppleSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconApple.displayName = 'IconApple';

/** IconArrow 图标 */
export const IconArrow = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconArrowSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconArrow.displayName = 'IconArrow';

/** IconArrowDown 图标 */
export const IconArrowDown = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconArrowDownSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconArrowDown.displayName = 'IconArrowDown';

/** IconArrowUp 图标 */
export const IconArrowUp = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconArrowUpSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconArrowUp.displayName = 'IconArrowUp';

/** IconAToZ 图标 */
export const IconAToZ = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconAToZSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconAToZ.displayName = 'IconAToZ';

/** IconAttach 图标 */
export const IconAttach = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconAttachSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconAttach.displayName = 'IconAttach';

/** IconAxe 图标 */
export const IconAxe = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconAxeSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconAxe.displayName = 'IconAxe';

/** IconBackpack 图标 */
export const IconBackpack = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBackpackSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBackpack.displayName = 'IconBackpack';

/** IconBamboo 图标 */
export const IconBamboo = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBambooSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBamboo.displayName = 'IconBamboo';

/** IconBank 图标 */
export const IconBank = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBankSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBank.displayName = 'IconBank';

/** IconBear 图标 */
export const IconBear = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBearSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBear.displayName = 'IconBear';

/** IconBed 图标 */
export const IconBed = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBedSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBed.displayName = 'IconBed';

/** IconBike 图标 */
export const IconBike = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBikeSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBike.displayName = 'IconBike';

/** IconBoat 图标 */
export const IconBoat = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBoatSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBoat.displayName = 'IconBoat';

/** IconBold 图标 */
export const IconBold = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBoldSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBold.displayName = 'IconBold';

/** IconBomb 图标 */
export const IconBomb = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBombSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBomb.displayName = 'IconBomb';

/** IconBone 图标 */
export const IconBone = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBoneSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBone.displayName = 'IconBone';

/** IconBook 图标 */
export const IconBook = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBookSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBook.displayName = 'IconBook';

/** IconBookmark 图标 */
export const IconBookmark = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBookmarkSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBookmark.displayName = 'IconBookmark';

/** IconBoss 图标 */
export const IconBoss = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBossSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBoss.displayName = 'IconBoss';

/** IconBow 图标 */
export const IconBow = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBowSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBow.displayName = 'IconBow';

/** IconBranch 图标 */
export const IconBranch = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBranchSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBranch.displayName = 'IconBranch';

/** IconBread 图标 */
export const IconBread = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBreadSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBread.displayName = 'IconBread';

/** IconBrush 图标 */
export const IconBrush = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBrushSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBrush.displayName = 'IconBrush';

/** IconBug 图标 */
export const IconBug = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBugSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBug.displayName = 'IconBug';

/** IconBullet 图标 */
export const IconBullet = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBulletSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBullet.displayName = 'IconBullet';

/** IconBullhorn 图标 */
export const IconBullhorn = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBullhornSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBullhorn.displayName = 'IconBullhorn';

/** IconBus 图标 */
export const IconBus = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconBusSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconBus.displayName = 'IconBus';

/** IconCactus 图标 */
export const IconCactus = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCactusSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCactus.displayName = 'IconCactus';

/** IconCalendar 图标 */
export const IconCalendar = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCalendarSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCalendar.displayName = 'IconCalendar';

/** IconCamera 图标 */
export const IconCamera = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCameraSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCamera.displayName = 'IconCamera';

/** IconCapsule 图标 */
export const IconCapsule = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCapsuleSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCapsule.displayName = 'IconCapsule';

/** IconCard 图标 */
export const IconCard = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCardSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCard.displayName = 'IconCard';

/** IconCards 图标 */
export const IconCards = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCardsSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCards.displayName = 'IconCards';

/** IconCat 图标 */
export const IconCat = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCatSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCat.displayName = 'IconCat';

/** IconChair 图标 */
export const IconChair = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconChairSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconChair.displayName = 'IconChair';

/** IconChange 图标 */
export const IconChange = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconChangeSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconChange.displayName = 'IconChange';

/** IconCharacter 图标 */
export const IconCharacter = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCharacterSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCharacter.displayName = 'IconCharacter';

/** IconCheck 图标 */
export const IconCheck = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCheckSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCheck.displayName = 'IconCheck';

/** IconChest 图标 */
export const IconChest = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconChestSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconChest.displayName = 'IconChest';

/** IconChevronLeft 图标 */
export const IconChevronLeft = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconChevronLeftSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconChevronLeft.displayName = 'IconChevronLeft';

/** IconChevronRight 图标 */
export const IconChevronRight = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconChevronRightSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconChevronRight.displayName = 'IconChevronRight';

/** IconCircle 图标 */
export const IconCircle = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCircleSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCircle.displayName = 'IconCircle';

/** IconCircleRing 图标 */
export const IconCircleRing = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCircleRingSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCircleRing.displayName = 'IconCircleRing';

/** IconClapper 图标 */
export const IconClapper = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconClapperSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconClapper.displayName = 'IconClapper';

/** IconClock 图标 */
export const IconClock = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconClockSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconClock.displayName = 'IconClock';

/** IconClose 图标 */
export const IconClose = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCloseSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconClose.displayName = 'IconClose';

/** IconCloud 图标 */
export const IconCloud = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCloudSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCloud.displayName = 'IconCloud';

/** IconCloudy 图标 */
export const IconCloudy = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCloudySrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCloudy.displayName = 'IconCloudy';

/** IconClover 图标 */
export const IconClover = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCloverSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconClover.displayName = 'IconClover';

/** IconClubCard 图标 */
export const IconClubCard = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconClubCardSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconClubCard.displayName = 'IconClubCard';

/** IconClubs 图标 */
export const IconClubs = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconClubsSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconClubs.displayName = 'IconClubs';

/** IconCoat 图标 */
export const IconCoat = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCoatSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCoat.displayName = 'IconCoat';

/** IconCode 图标 */
export const IconCode = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCodeSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCode.displayName = 'IconCode';

/** IconCoin 图标 */
export const IconCoin = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCoinSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCoin.displayName = 'IconCoin';

/** IconCompass 图标 */
export const IconCompass = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCompassSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCompass.displayName = 'IconCompass';

/** IconCopyEdit 图标 */
export const IconCopyEdit = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCopyEditSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCopyEdit.displayName = 'IconCopyEdit';

/** IconCorner 图标 */
export const IconCorner = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCornerSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCorner.displayName = 'IconCorner';

/** IconCow 图标 */
export const IconCow = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCowSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCow.displayName = 'IconCow';

/** IconCrown 图标 */
export const IconCrown = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconCrownSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconCrown.displayName = 'IconCrown';

/** IconDagger 图标 */
export const IconDagger = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDaggerSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDagger.displayName = 'IconDagger';

/** IconDarkMode 图标 */
export const IconDarkMode = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDarkModeSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDarkMode.displayName = 'IconDarkMode';

/** IconDeath 图标 */
export const IconDeath = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDeathSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDeath.displayName = 'IconDeath';

/** IconDemon 图标 */
export const IconDemon = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDemonSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDemon.displayName = 'IconDemon';

/** IconDemon2 图标 */
export const IconDemon2 = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDemon2Src ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDemon2.displayName = 'IconDemon2';

/** IconDiamond 图标 */
export const IconDiamond = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDiamondSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDiamond.displayName = 'IconDiamond';

/** IconDiamonds 图标 */
export const IconDiamonds = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDiamondsSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDiamonds.displayName = 'IconDiamonds';

/** IconDice 图标 */
export const IconDice = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDiceSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDice.displayName = 'IconDice';

/** IconDicePair 图标 */
export const IconDicePair = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDicePairSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDicePair.displayName = 'IconDicePair';

/** IconDislike 图标 */
export const IconDislike = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDislikeSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDislike.displayName = 'IconDislike';

/** IconDisplay 图标 */
export const IconDisplay = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDisplaySrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDisplay.displayName = 'IconDisplay';

/** IconDocument 图标 */
export const IconDocument = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDocumentSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDocument.displayName = 'IconDocument';

/** IconDog 图标 */
export const IconDog = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDogSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDog.displayName = 'IconDog';

/** IconDoor 图标 */
export const IconDoor = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDoorSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDoor.displayName = 'IconDoor';

/** IconDownload 图标 */
export const IconDownload = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDownloadSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDownload.displayName = 'IconDownload';

/** IconDress 图标 */
export const IconDress = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDressSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDress.displayName = 'IconDress';

/** IconDrink 图标 */
export const IconDrink = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDrinkSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDrink.displayName = 'IconDrink';

/** IconDumbbell 图标 */
export const IconDumbbell = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconDumbbellSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconDumbbell.displayName = 'IconDumbbell';

/** IconEarring 图标 */
export const IconEarring = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconEarringSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconEarring.displayName = 'IconEarring';

/** IconEdit 图标 */
export const IconEdit = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconEditSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconEdit.displayName = 'IconEdit';

/** IconEmoji 图标 */
export const IconEmoji = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconEmojiSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconEmoji.displayName = 'IconEmoji';

/** IconEquals 图标 */
export const IconEquals = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconEqualsSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconEquals.displayName = 'IconEquals';

/** IconEraser 图标 */
export const IconEraser = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconEraserSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconEraser.displayName = 'IconEraser';

/** IconEur 图标 */
export const IconEur = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconEurSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconEur.displayName = 'IconEur';

/** IconExclamation 图标 */
export const IconExclamation = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconExclamationSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconExclamation.displayName = 'IconExclamation';

/** IconExpand 图标 */
export const IconExpand = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconExpandSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconExpand.displayName = 'IconExpand';

/** IconExternalLink 图标 */
export const IconExternalLink = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconExternalLinkSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconExternalLink.displayName = 'IconExternalLink';

/** IconExport 图标 */
export const IconExport = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconExportSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconExport.displayName = 'IconExport';

/** IconFemale 图标 */
export const IconFemale = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconFemaleSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconFemale.displayName = 'IconFemale';

/** IconFile 图标 */
export const IconFile = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconFileSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconFile.displayName = 'IconFile';

/** IconFill 图标 */
export const IconFill = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconFillSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconFill.displayName = 'IconFill';

/** IconFilm 图标 */
export const IconFilm = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconFilmSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconFilm.displayName = 'IconFilm';

/** IconFire 图标 */
export const IconFire = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconFireSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconFire.displayName = 'IconFire';

/** IconFish 图标 */
export const IconFish = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconFishSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconFish.displayName = 'IconFish';

/** IconFish2 图标 */
export const IconFish2 = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconFish2Src ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconFish2.displayName = 'IconFish2';

/** IconFishhook 图标 */
export const IconFishhook = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconFishhookSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconFishhook.displayName = 'IconFishhook';

/** IconFlag 图标 */
export const IconFlag = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconFlagSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconFlag.displayName = 'IconFlag';

/** IconFlower 图标 */
export const IconFlower = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconFlowerSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconFlower.displayName = 'IconFlower';

/** IconFolder 图标 */
export const IconFolder = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconFolderSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconFolder.displayName = 'IconFolder';

/** IconFont 图标 */
export const IconFont = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconFontSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconFont.displayName = 'IconFont';

/** IconForest 图标 */
export const IconForest = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconForestSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconForest.displayName = 'IconForest';

/** IconFox 图标 */
export const IconFox = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconFoxSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconFox.displayName = 'IconFox';

/** IconFrame 图标 */
export const IconFrame = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconFrameSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconFrame.displayName = 'IconFrame';

/** IconFunnel 图标 */
export const IconFunnel = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconFunnelSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconFunnel.displayName = 'IconFunnel';

/** IconGbp 图标 */
export const IconGbp = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconGbpSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconGbp.displayName = 'IconGbp';

/** IconGhost 图标 */
export const IconGhost = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconGhostSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconGhost.displayName = 'IconGhost';

/** IconGlobe 图标 */
export const IconGlobe = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconGlobeSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconGlobe.displayName = 'IconGlobe';

/** IconGrass 图标 */
export const IconGrass = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconGrassSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconGrass.displayName = 'IconGrass';

/** IconGrid 图标 */
export const IconGrid = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconGridSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconGrid.displayName = 'IconGrid';

/** IconHalloween 图标 */
export const IconHalloween = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconHalloweenSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconHalloween.displayName = 'IconHalloween';

/** IconHammer 图标 */
export const IconHammer = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconHammerSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconHammer.displayName = 'IconHammer';

/** IconHayfork 图标 */
export const IconHayfork = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconHayforkSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconHayfork.displayName = 'IconHayfork';

/** IconHeadset 图标 */
export const IconHeadset = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconHeadsetSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconHeadset.displayName = 'IconHeadset';

/** IconHealth 图标 */
export const IconHealth = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconHealthSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconHealth.displayName = 'IconHealth';

/** IconHeart 图标 */
export const IconHeart = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconHeartSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconHeart.displayName = 'IconHeart';

/** IconHeartBreak 图标 */
export const IconHeartBreak = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconHeartBreakSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconHeartBreak.displayName = 'IconHeartBreak';

/** IconHeartCard 图标 */
export const IconHeartCard = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconHeartCardSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconHeartCard.displayName = 'IconHeartCard';

/** IconHearts 图标 */
export const IconHearts = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconHeartsSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconHearts.displayName = 'IconHearts';

/** IconHelm 图标 */
export const IconHelm = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconHelmSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconHelm.displayName = 'IconHelm';

/** IconHistory 图标 */
export const IconHistory = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconHistorySrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconHistory.displayName = 'IconHistory';

/** IconHorn 图标 */
export const IconHorn = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconHornSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconHorn.displayName = 'IconHorn';

/** IconHorse 图标 */
export const IconHorse = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconHorseSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconHorse.displayName = 'IconHorse';

/** IconHouse 图标 */
export const IconHouse = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconHouseSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconHouse.displayName = 'IconHouse';

/** IconImage 图标 */
export const IconImage = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconImageSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconImage.displayName = 'IconImage';

/** IconImport 图标 */
export const IconImport = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconImportSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconImport.displayName = 'IconImport';

/** IconInfo 图标 */
export const IconInfo = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconInfoSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconInfo.displayName = 'IconInfo';

/** IconIngot 图标 */
export const IconIngot = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconIngotSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconIngot.displayName = 'IconIngot';

/** IconInr 图标 */
export const IconInr = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconInrSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconInr.displayName = 'IconInr';

/** IconInternet 图标 */
export const IconInternet = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconInternetSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconInternet.displayName = 'IconInternet';

/** IconInvisible 图标 */
export const IconInvisible = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconInvisibleSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconInvisible.displayName = 'IconInvisible';

/** IconItalic 图标 */
export const IconItalic = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconItalicSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconItalic.displayName = 'IconItalic';

/** IconKey 图标 */
export const IconKey = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconKeySrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconKey.displayName = 'IconKey';

/** IconKeyboard 图标 */
export const IconKeyboard = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconKeyboardSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconKeyboard.displayName = 'IconKeyboard';

/** IconKrw 图标 */
export const IconKrw = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconKrwSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconKrw.displayName = 'IconKrw';

/** IconLaptop 图标 */
export const IconLaptop = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconLaptopSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconLaptop.displayName = 'IconLaptop';

/** IconLeaves 图标 */
export const IconLeaves = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconLeavesSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconLeaves.displayName = 'IconLeaves';

/** IconLevel 图标 */
export const IconLevel = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconLevelSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconLevel.displayName = 'IconLevel';

/** IconLight 图标 */
export const IconLight = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconLightSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconLight.displayName = 'IconLight';

/** IconLightMode 图标 */
export const IconLightMode = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconLightModeSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconLightMode.displayName = 'IconLightMode';

/** IconLike 图标 */
export const IconLike = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconLikeSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconLike.displayName = 'IconLike';

/** IconLink 图标 */
export const IconLink = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconLinkSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconLink.displayName = 'IconLink';

/** IconLive 图标 */
export const IconLive = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconLiveSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconLive.displayName = 'IconLive';

/** IconLocation 图标 */
export const IconLocation = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconLocationSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconLocation.displayName = 'IconLocation';

/** IconLog 图标 */
export const IconLog = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconLogSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconLog.displayName = 'IconLog';

/** IconLock 图标 */
export const IconLock = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconLockSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconLock.displayName = 'IconLock';

/** IconMace 图标 */
export const IconMace = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMaceSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMace.displayName = 'IconMace';

/** IconMagazine 图标 */
export const IconMagazine = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMagazineSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMagazine.displayName = 'IconMagazine';

/** IconMagnet 图标 */
export const IconMagnet = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMagnetSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMagnet.displayName = 'IconMagnet';

/** IconMahjong 图标 */
export const IconMahjong = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMahjongSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMahjong.displayName = 'IconMahjong';

/** IconMail 图标 */
export const IconMail = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMailSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMail.displayName = 'IconMail';

/** IconMale 图标 */
export const IconMale = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMaleSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMale.displayName = 'IconMale';

/** IconMana 图标 */
export const IconMana = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconManaSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMana.displayName = 'IconMana';

/** IconMap 图标 */
export const IconMap = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMapSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMap.displayName = 'IconMap';

/** IconMention 图标 */
export const IconMention = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMentionSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMention.displayName = 'IconMention';

/** IconMenu 图标 */
export const IconMenu = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMenuSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMenu.displayName = 'IconMenu';

/** IconMessage 图标 */
export const IconMessage = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMessageSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMessage.displayName = 'IconMessage';

/** IconMeteor 图标 */
export const IconMeteor = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMeteorSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMeteor.displayName = 'IconMeteor';

/** IconMic 图标 */
export const IconMic = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMicSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMic.displayName = 'IconMic';

/** IconMinus 图标 */
export const IconMinus = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMinusSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMinus.displayName = 'IconMinus';

/** IconMissile 图标 */
export const IconMissile = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMissileSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMissile.displayName = 'IconMissile';

/** IconMouse 图标 */
export const IconMouse = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMouseSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMouse.displayName = 'IconMouse';

/** IconMusic 图标 */
export const IconMusic = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMusicSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMusic.displayName = 'IconMusic';

/** IconMute 图标 */
export const IconMute = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconMuteSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconMute.displayName = 'IconMute';

/** IconNail 图标 */
export const IconNail = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconNailSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconNail.displayName = 'IconNail';

/** IconNecklace 图标 */
export const IconNecklace = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconNecklaceSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconNecklace.displayName = 'IconNecklace';

/** IconNecktie 图标 */
export const IconNecktie = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconNecktieSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconNecktie.displayName = 'IconNecktie';

/** IconNext 图标 */
export const IconNext = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconNextSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconNext.displayName = 'IconNext';

/** IconNgn 图标 */
export const IconNgn = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconNgnSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconNgn.displayName = 'IconNgn';

/** IconNight 图标 */
export const IconNight = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconNightSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconNight.displayName = 'IconNight';

/** IconPanda 图标 */
export const IconPanda = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPandaSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPanda.displayName = 'IconPanda';

/** IconPants 图标 */
export const IconPants = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPantsSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPants.displayName = 'IconPants';

/** IconPaste 图标 */
export const IconPaste = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPasteSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPaste.displayName = 'IconPaste';

/** IconPause 图标 */
export const IconPause = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPauseSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPause.displayName = 'IconPause';

/** IconPcHost 图标 */
export const IconPcHost = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPcHostSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPcHost.displayName = 'IconPcHost';

/** IconPhone 图标 */
export const IconPhone = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPhoneSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPhone.displayName = 'IconPhone';

/** IconPi 图标 */
export const IconPi = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPiSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPi.displayName = 'IconPi';

/** IconPickaxe 图标 */
export const IconPickaxe = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPickaxeSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPickaxe.displayName = 'IconPickaxe';

/** IconPig 图标 */
export const IconPig = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPigSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPig.displayName = 'IconPig';

/** IconPill 图标 */
export const IconPill = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPillSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPill.displayName = 'IconPill';

/** IconPistol 图标 */
export const IconPistol = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPistolSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPistol.displayName = 'IconPistol';

/** IconPlane 图标 */
export const IconPlane = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPlaneSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPlane.displayName = 'IconPlane';

/** IconPlay 图标 */
export const IconPlay = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPlaySrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPlay.displayName = 'IconPlay';

/** IconPlus 图标 */
export const IconPlus = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPlusSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPlus.displayName = 'IconPlus';

/** IconPotion 图标 */
export const IconPotion = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPotionSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPotion.displayName = 'IconPotion';

/** IconPrevious 图标 */
export const IconPrevious = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPreviousSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPrevious.displayName = 'IconPrevious';

/** IconProgress 图标 */
export const IconProgress = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconProgressSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconProgress.displayName = 'IconProgress';

/** IconProhibited 图标 */
export const IconProhibited = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconProhibitedSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconProhibited.displayName = 'IconProhibited';

/** IconProtect 图标 */
export const IconProtect = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconProtectSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconProtect.displayName = 'IconProtect';

/** IconPushpin 图标 */
export const IconPushpin = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPushpinSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPushpin.displayName = 'IconPushpin';

/** IconPuzzle 图标 */
export const IconPuzzle = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPuzzleSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPuzzle.displayName = 'IconPuzzle';

/** IconPuzzle2 图标 */
export const IconPuzzle2 = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconPuzzle2Src ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconPuzzle2.displayName = 'IconPuzzle2';

/** IconQrCode 图标 */
export const IconQrCode = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconQrCodeSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconQrCode.displayName = 'IconQrCode';

/** IconRabbit 图标 */
export const IconRabbit = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconRabbitSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconRabbit.displayName = 'IconRabbit';

/** IconRain 图标 */
export const IconRain = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconRainSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconRain.displayName = 'IconRain';

/** IconRainbow 图标 */
export const IconRainbow = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconRainbowSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconRainbow.displayName = 'IconRainbow';

/** IconRanking 图标 */
export const IconRanking = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconRankingSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconRanking.displayName = 'IconRanking';

/** IconRecord 图标 */
export const IconRecord = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconRecordSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconRecord.displayName = 'IconRecord';

/** IconRedo 图标 */
export const IconRedo = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconRedoSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconRedo.displayName = 'IconRedo';

/** IconRefresh 图标 */
export const IconRefresh = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconRefreshSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconRefresh.displayName = 'IconRefresh';

/** IconRestore 图标 */
export const IconRestore = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconRestoreSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconRestore.displayName = 'IconRestore';

/** IconRing 图标 */
export const IconRing = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconRingSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconRing.displayName = 'IconRing';

/** IconRiver 图标 */
export const IconRiver = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconRiverSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconRiver.displayName = 'IconRiver';

/** IconRotateLeft 图标 */
export const IconRotateLeft = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconRotateLeftSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconRotateLeft.displayName = 'IconRotateLeft';

/** IconRub 图标 */
export const IconRub = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconRubSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconRub.displayName = 'IconRub';

/** IconRuler 图标 */
export const IconRuler = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconRulerSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconRuler.displayName = 'IconRuler';

/** IconSave 图标 */
export const IconSave = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSaveSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSave.displayName = 'IconSave';

/** IconSaw 图标 */
export const IconSaw = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSawSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSaw.displayName = 'IconSaw';

/** IconScan 图标 */
export const IconScan = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconScanSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconScan.displayName = 'IconScan';

/** IconScissors 图标 */
export const IconScissors = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconScissorsSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconScissors.displayName = 'IconScissors';

/** IconSea 图标 */
export const IconSea = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSeaSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSea.displayName = 'IconSea';

/** IconSearch 图标 */
export const IconSearch = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSearchSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSearch.displayName = 'IconSearch';

/** IconSend 图标 */
export const IconSend = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSendSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSend.displayName = 'IconSend';

/** IconSettings 图标 */
export const IconSettings = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSettingsSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSettings.displayName = 'IconSettings';

/** IconShare 图标 */
export const IconShare = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconShareSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconShare.displayName = 'IconShare';

/** IconSheep 图标 */
export const IconSheep = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSheepSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSheep.displayName = 'IconSheep';

/** IconShield 图标 */
export const IconShield = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconShieldSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconShield.displayName = 'IconShield';

/** IconShield2 图标 */
export const IconShield2 = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconShield2Src ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconShield2.displayName = 'IconShield2';

/** IconShirt 图标 */
export const IconShirt = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconShirtSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconShirt.displayName = 'IconShirt';

/** IconShoe 图标 */
export const IconShoe = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconShoeSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconShoe.displayName = 'IconShoe';

/** IconShop 图标 */
export const IconShop = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconShopSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconShop.displayName = 'IconShop';

/** IconShorts 图标 */
export const IconShorts = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconShortsSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconShorts.displayName = 'IconShorts';

/** IconShovel 图标 */
export const IconShovel = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconShovelSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconShovel.displayName = 'IconShovel';

/** IconShrimp 图标 */
export const IconShrimp = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconShrimpSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconShrimp.displayName = 'IconShrimp';

/** IconSickle 图标 */
export const IconSickle = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSickleSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSickle.displayName = 'IconSickle';

/** IconSign 图标 */
export const IconSign = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSignSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSign.displayName = 'IconSign';

/** IconSilent 图标 */
export const IconSilent = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSilentSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSilent.displayName = 'IconSilent';

/** IconSkirt 图标 */
export const IconSkirt = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSkirtSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSkirt.displayName = 'IconSkirt';

/** IconSkull 图标 */
export const IconSkull = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSkullSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSkull.displayName = 'IconSkull';

/** IconSlider 图标 */
export const IconSlider = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSliderSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSlider.displayName = 'IconSlider';

/** IconSnowy 图标 */
export const IconSnowy = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSnowySrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSnowy.displayName = 'IconSnowy';

/** IconSoccer 图标 */
export const IconSoccer = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSoccerSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSoccer.displayName = 'IconSoccer';

/** IconSort 图标 */
export const IconSort = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSortSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSort.displayName = 'IconSort';

/** IconSpades 图标 */
export const IconSpades = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSpadesSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSpades.displayName = 'IconSpades';

/** IconSpear 图标 */
export const IconSpear = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSpearSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSpear.displayName = 'IconSpear';

/** IconSplit 图标 */
export const IconSplit = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSplitSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSplit.displayName = 'IconSplit';

/** IconSquare 图标 */
export const IconSquare = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSquareSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSquare.displayName = 'IconSquare';

/** IconStamina 图标 */
export const IconStamina = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconStaminaSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconStamina.displayName = 'IconStamina';

/** IconStar 图标 */
export const IconStar = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconStarSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconStar.displayName = 'IconStar';

/** IconStick 图标 */
export const IconStick = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconStickSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconStick.displayName = 'IconStick';

/** IconStone 图标 */
export const IconStone = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconStoneSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconStone.displayName = 'IconStone';

/** IconStop 图标 */
export const IconStop = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconStopSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconStop.displayName = 'IconStop';

/** IconSun 图标 */
export const IconSun = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSunSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSun.displayName = 'IconSun';

/** IconSun2 图标 */
export const IconSun2 = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSun2Src ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSun2.displayName = 'IconSun2';

/** IconSword 图标 */
export const IconSword = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSwordSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSword.displayName = 'IconSword';

/** IconSycee 图标 */
export const IconSycee = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconSyceeSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconSycee.displayName = 'IconSycee';

/** IconTable 图标 */
export const IconTable = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTableSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTable.displayName = 'IconTable';

/** IconTablet 图标 */
export const IconTablet = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTabletSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTablet.displayName = 'IconTablet';

/** IconTag 图标 */
export const IconTag = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTagSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTag.displayName = 'IconTag';

/** IconTent 图标 */
export const IconTent = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTentSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTent.displayName = 'IconTent';

/** IconTerminal 图标 */
export const IconTerminal = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTerminalSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTerminal.displayName = 'IconTerminal';

/** IconText 图标 */
export const IconText = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTextSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconText.displayName = 'IconText';

/** IconThb 图标 */
export const IconThb = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconThbSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconThb.displayName = 'IconThb';

/** IconTime 图标 */
export const IconTime = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTimeSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTime.displayName = 'IconTime';

/** IconToggleOff 图标 */
export const IconToggleOff = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconToggleOffSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconToggleOff.displayName = 'IconToggleOff';

/** IconToggleOn 图标 */
export const IconToggleOn = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconToggleOnSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconToggleOn.displayName = 'IconToggleOn';

/** IconToolKit 图标 */
export const IconToolKit = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconToolKitSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconToolKit.displayName = 'IconToolKit';

/** IconTorch 图标 */
export const IconTorch = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTorchSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTorch.displayName = 'IconTorch';

/** IconTower 图标 */
export const IconTower = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTowerSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTower.displayName = 'IconTower';

/** IconTown 图标 */
export const IconTown = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTownSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTown.displayName = 'IconTown';

/** IconTrash 图标 */
export const IconTrash = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTrashSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTrash.displayName = 'IconTrash';

/** IconTree 图标 */
export const IconTree = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTreeSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTree.displayName = 'IconTree';

/** IconTree2 图标 */
export const IconTree2 = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTree2Src ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTree2.displayName = 'IconTree2';

/** IconTriangle 图标 */
export const IconTriangle = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTriangleSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTriangle.displayName = 'IconTriangle';

/** IconTrident 图标 */
export const IconTrident = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTridentSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTrident.displayName = 'IconTrident';

/** IconTrophy 图标 */
export const IconTrophy = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTrophySrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTrophy.displayName = 'IconTrophy';

/** IconTruck 图标 */
export const IconTruck = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTruckSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTruck.displayName = 'IconTruck';

/** IconTry 图标 */
export const IconTry = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconTrySrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconTry.displayName = 'IconTry';

/** IconUmbrella 图标 */
export const IconUmbrella = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconUmbrellaSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconUmbrella.displayName = 'IconUmbrella';

/** IconUndo 图标 */
export const IconUndo = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconUndoSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconUndo.displayName = 'IconUndo';

/** IconUnlock 图标 */
export const IconUnlock = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconUnlockSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconUnlock.displayName = 'IconUnlock';

/** IconUpload 图标 */
export const IconUpload = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconUploadSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconUpload.displayName = 'IconUpload';

/** IconUsd 图标 */
export const IconUsd = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconUsdSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconUsd.displayName = 'IconUsd';

/** IconUser 图标 */
export const IconUser = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconUserSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconUser.displayName = 'IconUser';

/** IconUserAdd 图标 */
export const IconUserAdd = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconUserAddSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconUserAdd.displayName = 'IconUserAdd';

/** IconUserAvatar 图标 */
export const IconUserAvatar = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconUserAvatarSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconUserAvatar.displayName = 'IconUserAvatar';

/** IconUserGroup 图标 */
export const IconUserGroup = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconUserGroupSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconUserGroup.displayName = 'IconUserGroup';

/** IconVideo 图标 */
export const IconVideo = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconVideoSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconVideo.displayName = 'IconVideo';

/** IconVisible 图标 */
export const IconVisible = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconVisibleSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconVisible.displayName = 'IconVisible';

/** IconVolcano 图标 */
export const IconVolcano = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconVolcanoSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconVolcano.displayName = 'IconVolcano';

/** IconVolume 图标 */
export const IconVolume = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconVolumeSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconVolume.displayName = 'IconVolume';

/** IconWand 图标 */
export const IconWand = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconWandSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconWand.displayName = 'IconWand';

/** IconWand2 图标 */
export const IconWand2 = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconWand2Src ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconWand2.displayName = 'IconWand2';

/** IconWatch 图标 */
export const IconWatch = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconWatchSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconWatch.displayName = 'IconWatch';

/** IconWater 图标 */
export const IconWater = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconWaterSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconWater.displayName = 'IconWater';

/** IconWebcam 图标 */
export const IconWebcam = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconWebcamSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconWebcam.displayName = 'IconWebcam';

/** IconWheel 图标 */
export const IconWheel = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconWheelSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconWheel.displayName = 'IconWheel';

/** IconWifi 图标 */
export const IconWifi = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconWifiSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconWifi.displayName = 'IconWifi';

/** IconWind 图标 */
export const IconWind = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconWindSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconWind.displayName = 'IconWind';

/** IconWineglass 图标 */
export const IconWineglass = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconWineglassSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconWineglass.displayName = 'IconWineglass';

/** IconWolf 图标 */
export const IconWolf = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconWolfSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconWolf.displayName = 'IconWolf';

/** IconWood 图标 */
export const IconWood = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconWoodSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconWood.displayName = 'IconWood';

/** IconWrench 图标 */
export const IconWrench = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconWrenchSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconWrench.displayName = 'IconWrench';

/** IconYen 图标 */
export const IconYen = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconYenSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconYen.displayName = 'IconYen';

/** IconYuan 图标 */
export const IconYuan = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconYuanSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconYuan.displayName = 'IconYuan';

/** IconZoomIn 图标 */
export const IconZoomIn = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconZoomInSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconZoomIn.displayName = 'IconZoomIn';

/** IconZoomOut 图标 */
export const IconZoomOut = React.forwardRef<SVGSVGElement, LuzzyIconProps>(
  ({ size = 16, className, ...props }, ref) => (
    <IconZoomOutSrc ref={ref} width={size} height={size} className={className} {...props} />
  )
);
IconZoomOut.displayName = 'IconZoomOut';
