
declare type HOC_Inject<InjectProps> = <Props extends InjectProps>(
    Component: React.ComponentType<Props>
) => React.ComponentType<Omit<Props, keyof InjectProps>>

declare type HOC_Expand<ExpandProps> = <Props>(
    Component: React.ComponentType<Props>
) => React.ComponentType<Props & ExpandProps>