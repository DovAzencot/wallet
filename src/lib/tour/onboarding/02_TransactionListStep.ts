import { useTransactionsStore } from '@/stores/Transactions';
import { IWalletHTMLElements } from '..';
import { IOnboardingGetStepFnArgs, OnboardingTourStep, ITourStep } from '../types';
import { getOnboardingTexts } from './OnboardingTourTexts';

export function getTransactionListStep(
    { isSmallScreen, toggleHighlightButton }: IOnboardingGetStepFnArgs): ITourStep {
    const txsLen = () => Object.values(useTransactionsStore().state.transactions).length;

    const ui: ITourStep['ui'] = {
        fadedElements: [
            IWalletHTMLElements.SIDEBAR_TESTNET,
            IWalletHTMLElements.SIDEBAR_LOGO,
            IWalletHTMLElements.SIDEBAR_ANNOUNCMENT_BOX,
            IWalletHTMLElements.SIDEBAR_PRICE_CHARTS,
            IWalletHTMLElements.SIDEBAR_TRADE_ACTIONS,
            IWalletHTMLElements.SIDEBAR_ACCOUNT_MENU,
            IWalletHTMLElements.SIDEBAR_NETWORK,
            IWalletHTMLElements.SIDEBAR_SETTINGS,
            IWalletHTMLElements.ACCOUNT_OVERVIEW_MOBILE_ACTION_BAR,
            IWalletHTMLElements.ACCOUNT_OVERVIEW_BACKUP_ALERT,
            IWalletHTMLElements.ACCOUNT_OVERVIEW_TABLET_MENU_BAR,
            IWalletHTMLElements.ACCOUNT_OVERVIEW_BALANCE,
            IWalletHTMLElements.ACCOUNT_OVERVIEW_ADDRESS_LIST,
            IWalletHTMLElements.ACCOUNT_OVERVIEW_BITCOIN,
            IWalletHTMLElements.ADDRESS_OVERVIEW_MOBILE_ACTION_BAR,
        ],
        disabledElements: [
            IWalletHTMLElements.ADDRESS_OVERVIEW_ACTIONS_MOBILE,
            IWalletHTMLElements.ADDRESS_OVERVIEW_TRANSACTIONS,
            IWalletHTMLElements.ADDRESS_OVERVIEW_ACTIVE_ADDRESS,
            IWalletHTMLElements.ADDRESS_OVERVIEW_ACTIONS,
        ],
        disabledButtons: [
            IWalletHTMLElements.BUTTON_SIDEBAR_BUY,
            IWalletHTMLElements.BUTTON_SIDEBAR_SELL,
            IWalletHTMLElements.BUTTON_ADDRESS_OVERVIEW_BUY,
        ],
        scrollLockedElements: [`${IWalletHTMLElements.ADDRESS_OVERVIEW_TRANSACTIONS} .vue-recycle-scroller `],
    };

    return {
        get path() {
            return isSmallScreen.value ? '/transactions' : '/';
        },
        tooltip: {
            get target() {
                if (txsLen() > 0) {
                    return isSmallScreen.value
                        ? `${IWalletHTMLElements.ADDRESS_OVERVIEW_TRANSACTIONS}
                                .vue-recycle-scroller__item-view:nth-child(2)`
                        : '.address-overview';
                }
                return isSmallScreen.value
                    ? `${IWalletHTMLElements.ADDRESS_OVERVIEW_TRANSACTIONS} > .empty-state h2`
                    : '.address-overview';
            },
            get content() {
                return getOnboardingTexts(
                    OnboardingTourStep.TRANSACTION_LIST)[txsLen() === 0 ? 'default' : 'alternative'] || [];
            },
            params: {
                get placement() {
                    if (txsLen() > 0) {
                        return isSmallScreen.value ? 'bottom' : 'left';
                    }
                    return isSmallScreen.value ? 'top' : 'left';
                },
            },
        },
        lifecycle: {
            mounted: () => {
                if (txsLen() > 0) return undefined;
                toggleHighlightButton(IWalletHTMLElements.BUTTON_ADDRESS_OVERVIEW_RECEIVE_FREE_NIM, true, 'green');
                return () => toggleHighlightButton(
                    IWalletHTMLElements.BUTTON_ADDRESS_OVERVIEW_RECEIVE_FREE_NIM, false, 'green');
            },
        },
        get ui() {
            return {
                ...ui,
                isNextStepDisabled: txsLen() === 0,
            };
        },
    };
}
