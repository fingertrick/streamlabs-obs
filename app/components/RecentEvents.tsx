import cx from 'classnames';
import moment from 'moment';
import { Inject } from 'services/core';
import { $t } from 'services/i18n';
import { IRecentEvent, RecentEventsService } from 'services/recent-events';
import { Component, Prop } from 'vue-property-decorator';
import styles from './RecentEvents.m.less';
import TsxComponent, { createProps } from './tsx-component';
import BrowserView from 'components/shared/BrowserView';
import { UserService } from 'services/user';
import electron from 'electron';
import { NavigationService } from 'services/navigation';
import { CustomizationService } from 'services/customization';
import HelpTip from './shared/HelpTip';
import { EDismissable, DismissablesService } from 'services/dismissables';
import { MagicLinkService } from 'services/magic-link';

const getName = (event: IRecentEvent) => {
  if (event.gifter) return event.gifter;
  if (event.from) return event.from;
  return event.name;
};

class RecentEventsProps {
  isOverlay: boolean = false;
}

@Component({ props: createProps(RecentEventsProps) })
export default class RecentEvents extends TsxComponent<RecentEventsProps> {
  @Inject() recentEventsService: RecentEventsService;
  @Inject() userService: UserService;
  @Inject() navigationService: NavigationService;
  @Inject() customizationService: CustomizationService;
  @Inject() dismissablesService: DismissablesService;
  @Inject() magicLinkService: MagicLinkService;

  eventsCollapsed = false;

  get native() {
    return !this.customizationService.state.legacyEvents;
  }

  get recentEvents() {
    return this.recentEventsService.state.recentEvents;
  }

  get muted() {
    return this.recentEventsService.state.muted;
  }

  get queuePaused() {
    return this.recentEventsService.state.queuePaused;
  }

  get mediaShareEnabled() {
    return this.recentEventsService.state.mediaShareEnabled;
  }

  formatMoney(amount: string, type: string) {
    const prefix = type === 'donation' ? '$' : '';
    const numAmount = Number.parseFloat(amount);
    return `${prefix}${type === 'donation' ? numAmount.toFixed(2) : numAmount.toFixed(0)}`;
  }

  eventString(event: IRecentEvent) {
    return this.recentEventsService.getEventString(event);
  }

  repeatAlert(event: IRecentEvent) {
    return this.recentEventsService.repeatAlert(event);
  }

  popoutRecentEvents() {
    this.$emit('popout');
    return this.recentEventsService.openRecentEventsWindow();
  }

  popoutMediaShare() {
    return this.recentEventsService.openRecentEventsWindow(true);
  }

  popoutFilterMenu() {
    return this.recentEventsService.showFilterMenu();
  }

  muteEvents() {
    return this.recentEventsService.toggleMuteEvents();
  }

  skipAlert() {
    return this.recentEventsService.skipAlert();
  }

  readAlert(event: IRecentEvent) {
    return this.recentEventsService.readAlert(event);
  }

  toggleQueue() {
    return this.recentEventsService.toggleQueue();
  }

  setNative(native: boolean) {
    if (!native && this.customizationService.state.eventsSize < 250) {
      // Switch to a reasonably sized events feed
      this.customizationService.setSettings({ eventsSize: 250 });
    }

    if (!native) {
      this.dismissablesService.dismiss(EDismissable.RecentEventsHelpTip);
    }

    if (native) {
      this.recentEventsService.refresh();
    }

    this.customizationService.setSettings({ legacyEvents: !native });
  }

  magicLinkDisabled = false;

  handleBrowserViewReady(view: Electron.BrowserView) {
    if (view.isDestroyed()) return;

    electron.ipcRenderer.send('webContents-preventPopup', view.webContents.id);

    view.webContents.on('new-window', async (e, url) => {
      const match = url.match(/dashboard\/([^\/^\?]*)/);

      if (match && match[1] === 'recent-events') {
        this.popoutRecentEvents();
      } else if (match) {
        // Prevent spamming our API
        if (this.magicLinkDisabled) return;
        this.magicLinkDisabled = true;

        try {
          const link = await this.magicLinkService.getDashboardMagicLink(match[1]);
          electron.remote.shell.openExternal(link);
        } catch (e) {
          console.error('Error generating dashboard magic link', e);
        }

        this.magicLinkDisabled = false;
      } else {
        electron.remote.shell.openExternal(url);
      }
    });
  }

  get renderNativeEvents() {
    return (
      <div class={cx(styles.eventContainer, this.props.isOverlay ? styles.overlay : '')}>
        {!!this.recentEvents.length &&
          this.recentEvents.map(event => (
            <EventCell
              key={event.uuid}
              event={event}
              repeatAlert={this.repeatAlert.bind(this)}
              eventString={this.eventString.bind(this)}
              readAlert={this.readAlert.bind(this)}
            />
          ))}
        {this.recentEvents.length === 0 && (
          <div class={styles.empty}>{$t('There are no events to display')}</div>
        )}
      </div>
    );
  }

  get renderEmbeddedEvents() {
    return (
      <BrowserView
        class={styles.eventContainer}
        src={this.userService.recentEventsUrl()}
        setLocale={true}
        onReady={view => this.handleBrowserViewReady(view)}
      />
    );
  }

  render() {
    return (
      <div class={styles.container}>
        {!this.props.isOverlay && (
          <Toolbar
            popoutMediaShare={() => this.popoutMediaShare()}
            popoutFilterMenu={() => this.popoutFilterMenu()}
            popoutRecentEvents={() => this.popoutRecentEvents()}
            muteEvents={() => this.muteEvents()}
            skipAlert={() => this.skipAlert()}
            toggleQueue={() => this.toggleQueue()}
            queuePaused={this.queuePaused}
            muted={this.muted}
            mediaShareEnabled={this.mediaShareEnabled}
            native={this.native}
            onNativeswitch={val => this.setNative(val)}
          />
        )}
        {this.native ? this.renderNativeEvents : this.renderEmbeddedEvents}
        {!this.props.isOverlay && (
          <HelpTip
            dismissableKey={EDismissable.RecentEventsHelpTip}
            position={{ top: '-8px', right: '360px' }}
            tipPosition="right"
          >
            <div slot="title">{$t('New Events Feed')}</div>
            <div slot="content">
              {$t(
                'We have combined the Editor & Live tabs, and given your events feed a new look. If you want to switch back to the old events feed, just click here.',
              )}
            </div>
          </HelpTip>
        )}
      </div>
    );
  }
}

class ToolbarProps {
  popoutMediaShare: () => void = () => {};
  popoutFilterMenu: () => void = () => {};
  popoutRecentEvents: () => void = () => {};
  muteEvents: () => void = () => {};
  skipAlert: () => void = () => {};
  toggleQueue: () => void = () => {};
  queuePaused: boolean = false;
  muted: boolean = false;
  mediaShareEnabled: boolean = false;
  native: boolean = true;
  onNativeswitch: (native: boolean) => void = () => {};
}

// TODO: Refactor into stateless functional component
@Component({ props: createProps(ToolbarProps) })
class Toolbar extends TsxComponent<ToolbarProps> {
  render() {
    const pauseTooltip = this.props.queuePaused
      ? $t('Unpause Alert Queue')
      : $t('Pause Alert Queue');
    return (
      <div class={styles.topBar}>
        <h2 class="studio-controls__label">{$t('Mini Feed')}</h2>
        <span class="action-icon" onClick={() => this.$emit('nativeswitch', !this.props.native)}>
          <i class="icon-live-dashboard" />
          <span style={{ marginLeft: '8px' }}>
            {this.props.native ? 'Switch to Legacy Events View' : 'Switch to New Events View'}
          </span>
        </span>
        {this.props.native && (
          <i
            class="icon-filter action-icon"
            onClick={this.props.popoutFilterMenu}
            v-tooltip={{ content: $t('Popout Event Filtering Options'), placement: 'bottom' }}
          />
        )}
        {this.props.native && this.props.mediaShareEnabled && (
          <i
            class="icon-music action-icon"
            onClick={this.props.popoutMediaShare}
            v-tooltip={{ content: $t('Popout Media Share Controls'), placement: 'bottom' }}
          />
        )}
        {this.props.native && (
          <i
            class={`${this.props.queuePaused ? 'icon-media-share-2' : 'icon-pause'} action-icon`}
            onClick={this.props.toggleQueue}
            v-tooltip={{ content: pauseTooltip, placement: 'bottom' }}
          />
        )}
        {this.props.native && (
          <i
            class="icon-skip action-icon"
            onClick={this.props.skipAlert}
            v-tooltip={{ content: $t('Skip Alert'), placement: 'bottom' }}
          />
        )}
        {this.props.native && (
          <i
            class={cx('action-icon', {
              [styles.red]: this.props.muted,
              fa: !this.props.muted,
              'fa-volume-up': !this.props.muted,
              'icon-mute': this.props.muted,
            })}
            onClick={this.props.muteEvents}
            v-tooltip={{ content: $t('Mute Event Sounds'), placement: 'bottom' }}
          />
        )}
      </div>
    );
  }
}

const classForType = (event: IRecentEvent) => {
  if (event.type === 'sticker' || event.type === 'effect') return event.currency;
  if (event.type === 'superchat' || event.formatted_amount) return 'donation';
  return event.type;
};

const amountString = (event: IRecentEvent) => {
  if (event.formatted_amount) return event.formatted_amount;
  if (event.type === 'superchat') return event.displayString;
  if (event.type === 'sticker' || event.type === 'effect') {
    return `${event.amount} ${event.currency}`;
  }
  return `${event.amount} ${event.type}`;
};

class EventCellProps {
  event: IRecentEvent = {} as IRecentEvent;
  eventString: (event: IRecentEvent) => string = () => '';
  repeatAlert: (event: IRecentEvent) => void = () => {};
  readAlert: (event: IRecentEvent) => void = () => {};
}

// TODO: Refactor into stateless functional component
@Component({ props: createProps(EventCellProps) })
class EventCell extends TsxComponent<EventCellProps> {
  timestamp = '';
  timestampInterval: number;

  mounted() {
    this.updateTimestamp();

    this.timestampInterval = window.setInterval(() => {
      this.updateTimestamp();
    }, 60 * 1000);
  }

  destroyed() {
    if (this.timestampInterval) clearInterval(this.timestampInterval);
  }

  updateTimestamp() {
    this.timestamp = moment.utc(this.createdAt).fromNow(true);
  }

  get createdAt(): moment.Moment {
    if (this.props.event.iso8601Created) {
      return moment(this.props.event.iso8601Created);
    }

    return moment.utc(this.props.event.created_at);
  }

  render() {
    return (
      <div
        class={cx(styles.cell, this.props.event.read ? styles.cellRead : '')}
        onClick={() => this.props.readAlert(this.props.event)}
      >
        <span class={styles.timestamp}>{this.timestamp}</span>
        <span class={styles.name}>{getName(this.props.event)}</span>
        <span>{this.props.eventString(this.props.event)}</span>
        {this.props.event.gifter && (
          <span class={styles.name}>
            {this.props.event.from ? this.props.event.from : this.props.event.name}
          </span>
        )}
        {this.props.event.amount && (
          <span class={styles[classForType(this.props.event)]}>
            {amountString(this.props.event)}
          </span>
        )}
        {(this.props.event.comment || this.props.event.message) && (
          <span class={styles.whisper}>
            {this.props.event.comment ? this.props.event.comment : this.props.event.message}
          </span>
        )}
        <i
          class="icon-repeat action-icon"
          onClick={(event: any) => {
            event.stopPropagation();
            this.props.repeatAlert(this.props.event);
          }}
          v-tooltip={{ content: $t('Repeat Alert'), placement: 'left' }}
        />
      </div>
    );
  }
}
