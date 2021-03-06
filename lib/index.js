/* @flow */

import type { Node } from 'react';
import React, { Component } from 'react';

import injectScript from './utils/injectScript';
import isAnyScriptPresent from './utils/isAnyScriptPresent';
import type { RecaptchaConfig, RecaptchaMethods } from './types';

type RenderProps = {
  renderExplicitly: () => Promise<void>,
  reset: () => Promise<void>,
  execute: () => Promise<void>,
  getResponse: () => Promise<string>,
  recaptchaComponent: Node
};

type Props = {
  id?: string,
  className?: string,
  sitekey: string,
  theme?: 'light' | 'dark',
  size?: 'compact' | 'normal' | 'invisible',
  badge?: 'bottomright' | 'bottomleft' | 'inline',
  tabindex?: number,
  explicit?: boolean,
  onLoad?: () => void,
  onRender?: () => void,
  onVerify: (response: string) => void,
  onExpire?: () => void,
  onError?: () => void,
  inject?: boolean,
  isolated?: boolean,
  hl?: string,
  enterprise?: boolean,
  action?: string,
  children?: (renderProps: RenderProps) => Node
};

type State = {
  instanceId: ?number,
  ready: boolean,
  rendered: boolean,
  invisible: boolean,
  timer: ?IntervalID
};

const RECAPTCHA_SCRIPT_PATH = 'https://recaptcha.net/recaptcha/';
const RECAPTCHA_SCRIPT_REGEX = /(http|https):\/\/(www)?.+\/recaptcha/;

class Reaptcha extends Component<Props, State> {
  container: ?HTMLDivElement = null;

  constructor(props: Props) {
    super(props);

    this.state = {
      instanceId: null,
      ready: false,
      rendered: false,
      invisible: this.props.size === 'invisible',
      timer: null
    };
  }

  static defaultProps = {
    id: '',
    className: 'g-recaptcha',
    theme: 'light',
    size: 'normal',
    badge: 'bottomright',
    tabindex: 0,
    explicit: false,
    inject: true,
    isolated: false,
    hl: '',
    enterprise: false,
    action: ''
  };

  _getRecaptchaMethods = (): RecaptchaMethods =>
    this.props.enterprise ? window.grecaptcha.enterprise : window.grecaptcha;

  _isAvailable = (): boolean =>
    Boolean(window && window.grecaptcha && this._getRecaptchaMethods().ready);

  _inject = (): void => {
    if (this.props.inject && !isAnyScriptPresent(RECAPTCHA_SCRIPT_REGEX)) {
      const hlParam = this.props.hl ? `&hl=${this.props.hl}` : '';
      const src = `${RECAPTCHA_SCRIPT_PATH}${
        this.props.enterprise ? 'enterprise.js' : 'api.js'
      }?render=explicit${hlParam}`;
      injectScript(src);
    }
  };

  _prepare = (): void => {
    const { explicit, onLoad } = this.props;
    this._getRecaptchaMethods().ready(() => {
      this.setState({ ready: true }, () => {
        if (!explicit) {
          this.renderExplicitly();
        }
        if (onLoad) {
          onLoad();
        }
      });
    });
  };

  _renderRecaptcha = (
    container: HTMLDivElement,
    config: RecaptchaConfig
  ): number => this._getRecaptchaMethods().render(container, config);

  _resetRecaptcha = (): void =>
    this._getRecaptchaMethods().reset(this.state.instanceId);

  _executeRecaptcha = (): void => {
    if (this.props.enterprise && this.props.action !== '') {
      return this._getRecaptchaMethods().execute(this.state.instanceId, {
        action: this.props.action
      });
    }
    return this._getRecaptchaMethods().execute(this.state.instanceId);
  };

  _getResponseRecaptcha = (): string =>
    this._getRecaptchaMethods().getResponse(this.state.instanceId);

  _stopTimer = (): void => {
    if (this.state.timer) {
      clearInterval(this.state.timer);
    }
  };

  componentDidMount = (): void => {
    this._inject();

    if (this._isAvailable()) {
      this._prepare();
    } else {
      const timer = setInterval(() => {
        if (this._isAvailable()) {
          this._prepare();
          this._stopTimer();
        }
      }, 500);
      this.setState({ timer });
    }
  };

  shouldComponentUpdate = (nextProps: Props): boolean =>
    this.props.className !== nextProps.className || !this.state.rendered;

  componentWillUnmount = (): void => {
    this._stopTimer();

    if (this.state.rendered) {
      this._resetRecaptcha();
    }
  };

  renderExplicitly = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (this.state.rendered) {
        return reject(
          new Error('This recaptcha instance has been already rendered.')
        );
      }
      if (this.state.ready && this.container) {
        const instanceId = this._renderRecaptcha(this.container, {
          sitekey: this.props.sitekey,
          theme: this.props.theme,
          size: this.props.size,
          badge: this.state.invisible ? this.props.badge : null,
          tabindex: this.props.tabindex,
          callback: this.props.onVerify,
          'expired-callback': this.props.onExpire,
          'error-callback': this.props.onError,
          isolated: this.state.invisible ? this.props.isolated : null,
          hl: this.state.invisible ? null : this.props.hl
        });

        this.setState(
          {
            instanceId,
            rendered: true
          },
          () => {
            if (this.props.onRender) {
              this.props.onRender();
            }
            resolve();
          }
        );
      } else {
        return reject(new Error('Recaptcha is not ready for rendering yet.'));
      }
    });
  };

  reset = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (this.state.rendered) {
        this._resetRecaptcha();
        return resolve();
      }
      reject(new Error('This recaptcha instance did not render yet.'));
    });
  };

  execute = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!this.state.invisible) {
        return reject(
          new Error('Manual execution is only available for invisible size.')
        );
      }
      if (this.state.rendered) {
        this._executeRecaptcha();
        resolve();
      }
      return reject(new Error('This recaptcha instance did not render yet.'));
    });
  };

  getResponse = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (this.state.rendered) {
        const response = this._getResponseRecaptcha();
        return resolve(response);
      }
      reject(new Error('This recaptcha instance did not render yet.'));
    });
  };

  render = () => {
    const container = (
      <div
        id={this.props.id}
        className={this.props.className}
        ref={e => (this.container = e)}
      />
    );

    return this.props.children
      ? this.props.children({
          renderExplicitly: this.renderExplicitly,
          reset: this.reset,
          execute: this.execute,
          getResponse: this.getResponse,
          recaptchaComponent: container
        })
      : container;
  };
}

export default Reaptcha;
