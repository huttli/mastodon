import punycode from 'punycode';

import PropTypes from 'prop-types';
import { PureComponent } from 'react';

import { FormattedMessage } from 'react-intl';

import classnames from 'classnames';

import Immutable from 'immutable';
import ImmutablePropTypes from 'react-immutable-proptypes';

import { Blurhash } from 'mastodon/components/blurhash';
import { Icon }  from 'mastodon/components/icon';
import { RelativeTimestamp } from 'mastodon/components/relative_timestamp';
import { useBlurhash } from 'mastodon/initial_state';

const IDNA_PREFIX = 'xn--';

const decodeIDNA = domain => {
  return domain
    .split('.')
    .map(part => part.indexOf(IDNA_PREFIX) === 0 ? punycode.decode(part.slice(IDNA_PREFIX.length)) : part)
    .join('.');
};

const getHostname = url => {
  const parser = document.createElement('a');
  parser.href = url;
  return parser.hostname;
};

const domParser = new DOMParser();

const addAutoPlay = html => {
  const document = domParser.parseFromString(html, 'text/html').documentElement;
  const iframe = document.querySelector('iframe');

  if (iframe) {
    if (iframe.src.indexOf('?') !== -1) {
      iframe.src += '&';
    } else {
      iframe.src += '?';
    }

    iframe.src += 'autoplay=1&auto_play=1';

    // DOM parser creates html/body elements around original HTML fragment,
    // so we need to get innerHTML out of the body and not the entire document
    return document.querySelector('body').innerHTML;
  }

  return html;
};

export default class Card extends PureComponent {

  static propTypes = {
    card: ImmutablePropTypes.map,
    onOpenMedia: PropTypes.func.isRequired,
    sensitive: PropTypes.bool,
  };

  state = {
    previewLoaded: false,
    embedded: false,
    revealed: !this.props.sensitive,
  };

  UNSAFE_componentWillReceiveProps (nextProps) {
    if (!Immutable.is(this.props.card, nextProps.card)) {
      this.setState({ embedded: false, previewLoaded: false });
    }
    if (this.props.sensitive !== nextProps.sensitive) {
      this.setState({ revealed: !nextProps.sensitive });
    }
  }

  componentDidMount () {
    window.addEventListener('resize', this.handleResize, { passive: true });
  }

  componentWillUnmount () {
    window.removeEventListener('resize', this.handleResize);
  }

  handlePhotoClick = () => {
    const { card, onOpenMedia } = this.props;

    onOpenMedia(
      Immutable.fromJS([
        {
          type: 'image',
          url: card.get('embed_url'),
          description: card.get('title'),
          meta: {
            original: {
              width: card.get('width'),
              height: card.get('height'),
            },
          },
        },
      ]),
      0,
    );
  };

  handleEmbedClick = () => {
    const { card } = this.props;

    if (card.get('type') === 'photo') {
      this.handlePhotoClick();
    } else {
      this.setState({ embedded: true });
    }
  };

  setRef = c => {
    this.node = c;
  };

  handleImageLoad = () => {
    this.setState({ previewLoaded: true });
  };

  handleReveal = e => {
    e.preventDefault();
    e.stopPropagation();
    this.setState({ revealed: true });
  };

  renderVideo () {
    const { card }  = this.props;
    const content   = { __html: addAutoPlay(card.get('html')) };

    return (
      <div
        ref={this.setRef}
        className='status-card__image status-card-video'
        dangerouslySetInnerHTML={content}
        style={{ aspectRatio: `${card.get('width')} / ${card.get('height')}` }}
      />
    );
  }

  render () {
    const { card } = this.props;
    const { embedded, revealed } = this.state;

    if (card === null) {
      return null;
    }

    const provider    = card.get('provider_name').length === 0 ? decodeIDNA(getHostname(card.get('url'))) : card.get('provider_name');
    const interactive = card.get('type') !== 'link';
    const language    = card.get('language') || '';

    const description = (
      <div className='status-card__content'>
        <span className='status-card__host'>
          <span lang={language}>{provider}</span>
          {card.get('published_at') && <> · <RelativeTimestamp timestamp={card.get('published_at')} /></>}
         </span>
        <strong className='status-card__title' title={card.get('title')} lang={language}>{card.get('title')}</strong>
        {card.get('author_name').length > 0 && <span className='status-card__author'><FormattedMessage id='link_preview.author' defaultMessage='By {name}' values={{ name: <strong>{card.get('author_name')}</strong> }} /></span>}
      </div>
    );

    const thumbnailStyle = {
      visibility: revealed ? null : 'hidden',
      aspectRatio: `${card.get('width')} / ${card.get('height')}`
    };

    let embed;

    let canvas = (
      <Blurhash
        className={classnames('status-card__image-preview', {
          'status-card__image-preview--hidden': revealed && this.state.previewLoaded,
        })}
        hash={card.get('blurhash')}
        dummy={!useBlurhash}
      />
    );

    let thumbnail = <img src={card.get('image')} alt='' style={thumbnailStyle} onLoad={this.handleImageLoad} className='status-card__image-image' />;

    let spoilerButton = (
      <button type='button' onClick={this.handleReveal} className='spoiler-button__overlay'>
        <span className='spoiler-button__overlay__label'>
          <FormattedMessage id='status.sensitive_warning' defaultMessage='Sensitive content' />
          <span className='spoiler-button__overlay__action'><FormattedMessage id='status.media.show' defaultMessage='Click to show' /></span>
        </span>
      </button>
    );

    spoilerButton = (
      <div className={classnames('spoiler-button', { 'spoiler-button--minified': revealed })}>
        {spoilerButton}
      </div>
    );

    if (interactive) {
      if (embedded) {
        embed = this.renderVideo();
      } else {
        let iconVariant = 'play';

        if (card.get('type') === 'photo') {
          iconVariant = 'search-plus';
        }

        embed = (
          <div className='status-card__image'>
            {canvas}
            {thumbnail}

            {revealed && (
              <div className='status-card__actions'>
                <div>
                  <button type='button' onClick={this.handleEmbedClick}><Icon id={iconVariant} /></button>
                  <a href={card.get('url')} target='_blank' rel='noopener noreferrer'><Icon id='external-link' /></a>
                </div>
              </div>
            )}

            {!revealed && spoilerButton}
          </div>
        );
      }

      return (
        <div className='status-card' ref={this.setRef} onClick={revealed ? null : this.handleReveal} role={revealed ? 'button' : null}>
          {embed}
          <a href={card.get('url')} target='_blank' rel='noopener noreferrer'>{description}</a>
        </div>
      );
    } else if (card.get('image')) {
      embed = (
        <div className='status-card__image'>
          {canvas}
          {thumbnail}
        </div>
      );
    } else {
      embed = (
        <div className='status-card__image' style={{ aspectRatio: '1.9 / 1' }}>
          <Icon id='file-text' />
        </div>
      );
    }

    return (
      <a href={card.get('url')} className='status-card' target='_blank' rel='noopener noreferrer' ref={this.setRef}>
        {embed}
        {description}
      </a>
    );
  }

}
